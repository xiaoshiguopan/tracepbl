import { MaterialResultSchema, SourceListSchema } from "@tracepbl/contracts";
import { localRequest } from "./local-api";
import { invalidateLocalTask } from "./local-task-data";
import { localSources } from "./local-view-model";
import { useTaskSources, useLocalTask } from "./LocalTaskBoundary";
import { isLocalMode } from "./runtime-mode";
import { useEffect, useMemo, useState } from "react";
import { getSourceSetSummary, normalizeSourceDraft, toggleSourceSelection, type SourceDiscoveryDraft, type SourceRecord } from "./source-discovery";
import { loadEvidenceDraft, loadQuestionDraft, loadSourceDraft, saveSourceDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";
import { IconButton, PageActionBar, UiIcon } from "./UiControls";

function readScenario() {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  return new URLSearchParams(window.location.search).get("p03-state") || "ready";
}

function SourceRow({ source, checked, active, onSelect, onOpen }: { source: SourceRecord; checked: boolean; active: boolean; onSelect: () => void; onOpen: () => void }) {
  return <article className={`source-row ${active ? "active" : ""}`}><label><input type="checkbox" checked={checked} disabled={!checked && source.usable === false} aria-label={`选用${source.title}`} onChange={onSelect} /></label><button className="source-row-open" type="button" aria-current={active ? "true" : undefined} onClick={onOpen}><span><strong>{source.title}</strong><small>{source.nature} · {source.statusNote ?? source.role}</small></span><span className="source-open-mark" aria-hidden="true">查看</span></button></article>;
}

export function SourceDiscoveryPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onNext }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onNext: () => void }) {
  const initialSources = useTaskSources();
  const localData = useLocalTask();
  const [extraSources, setExtraSources] = useState<typeof initialSources | null>(null);
  const sources = extraSources ?? initialSources;
  const [absentSensitive, setAbsentSensitive] = useState(false);
  const [rightsAuthorized, setRightsAuthorized] = useState(false);
  const [adding, setAdding] = useState(false);
  const scenario = useMemo(readScenario, []);
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const [draft, setDraft] = useState<SourceDiscoveryDraft>(() => normalizeSourceDraft());
  const [activeId, setActiveId] = useState(sources[0]?.id ?? "");
  const [more, setMore] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlExcerpt, setUrlExcerpt] = useState("");
  const [materialError, setMaterialError] = useState("");
  const [mobileView, setMobileView] = useState<"directory" | "reader" | "selected">("directory");
  const [loading, setLoading] = useState(scenario === "ready");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [evidenceReached, setEvidenceReached] = useState(false);
  const demoSummary = getSourceSetSummary(draft);
  const selected = sources.filter(source => draft.selectedIds.includes(source.id));
  const summary = isLocalMode ? { ...demoSummary, selected, selectedCount: selected.length, ready: selected.length >= 4 && selected.length <= 8 && new Set(selected.map(source => source.nature)).size >= 3 } : demoSummary;
  const active = sources.find((source) => source.id === activeId) || sources[0];
  const shown = more ? sources : sources.filter((_, index) => (index + draft.batch * 6) % sources.length < 6);

  useEffect(() => {
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadQuestionDraft(storageKey)]).then(([saved, evidence]) => {
      setDraft(isLocalMode && saved ? saved : normalizeSourceDraft(saved));
      setEvidenceReached(Boolean(evidence));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);
  useEffect(() => {
    if (isLocalMode || loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveSourceDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;
  const toggle = (id: string) => setDraft((current) => toggleSourceSelection(current, id));
  const changeNeed = (need: string) => setDraft((current) => ({ ...current, needs: current.needs.includes(need) ? current.needs.filter((item) => item !== need) : [...current.needs, need] }));
  const submitMaterial = async (input: {kind:"url";name:string;url:string}|{kind:"text";name:string;text:string}) => {
    if (!absentSensitive) { setMaterialError("请先确认材料不含个人、学生或敏感信息。"); return; }
    if (adding) return;
    setAdding(true);
    try {
      await localRequest(`/api/v1/tasks/${taskId}/materials`, MaterialResultSchema, {method:"POST", key:crypto.randomUUID(),body:{...input,rightsAttestation:rightsAuthorized?"authorizedForCurrentTask":"unknown",sensitiveInformationConfirmedAbsent:true}});
      invalidateLocalTask(taskId);
      const result=await localRequest(`/api/v1/tasks/${taskId}/sources`, SourceListSchema);
      if(localData) setExtraSources(localSources({...localData,sources:result.data.items}));
      setMaterialError("材料已加入本地目录。权利与可靠性仍待核验；加入不代表已通过。"); setUrlValue(""); setUrlExcerpt("");
    } catch(error) { setMaterialError(error instanceof Error?error.message:"材料加入失败。"); }
    finally { setAdding(false); }
  };
  const addUrl = () => {
    const value = urlValue.trim();
    try {
      const parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("protocol");
      if (isLocalMode) { if (urlExcerpt.trim()) { setMaterialError("本地网址只登记链接；摘录请作为 TXT 或 Markdown 单独加入，当前未启用网页抓取。"); return; } void submitMaterial({kind:"url",name:parsed.hostname,url:value}); return; }
      setDraft((current) => ({ ...current, ownMaterials: [...current.ownMaterials, { id: crypto.randomUUID(), kind: "url", name: parsed.hostname, content: `${value}\n${urlExcerpt.trim()}`.trim() }] }));
      setUrlValue(""); setUrlExcerpt(""); setMaterialError("");
    } catch { setMaterialError("请填写以 http:// 或 https:// 开头的完整网址。"); }
  };
  const addFile = async (file?: File) => {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { setMaterialError("当前只支持 TXT 或 Markdown 文件；PDF 与 Word 暂不解析。"); return; }
    const fullText = await file.text();
    if (isLocalMode) { if (fullText.length > 50000) { setMaterialError("文本超过50000字符，请缩减后重新加入；本次没有截断或保存。"); return; } await submitMaterial({kind:"text",name:file.name,text:fullText}); return; }
    const content = fullText.slice(0, 20000);
    setDraft((current) => ({ ...current, ownMaterials: [...current.ownMaterials, { id: crypto.randomUUID(), kind: "text", name: file.name, content }] }));
    setMaterialError("");
  };

  return (
    <WorkbenchShell currentStep={2} reachedStep={evidenceReached ? 3 : 2} currentLabel="查找史料" nextLabel="组织证据" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 3 ? onNext() : undefined}>
      <main className="context-main source-main" id="main-content">
        <header className="page-heading"><div><p className="eyebrow">围绕当前探究问题</p><h1>查找史料</h1></div><p className={`save-status ${saveState}`}>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">勾选就是采用；没勾选就是暂不采用。先读清来源与限制，再决定是否放进本课。</p>
        <details className="fixture-note"><summary>材料来源与使用边界</summary><p>{isLocalMode ? "目录由本地数据库提供。当前集成使用公开或合成材料；无联网搜索，未核验内容不能视为可靠历史结论。" : "目录来自可定位的古籍、博物馆与学术机构公开页面。系统解读是教学建议，不冒充史料原文或实时AI检索。"}</p></details>
        {adjusting ? <section className="adjust-panel"><header><div><h2>这次想补哪类材料？</h2><p>选中具体缺口后换一批；已勾选史料始终保留。</p></div><IconButton icon="close" label="关闭调整需求" onClick={() => setAdjusting(false)} /></header><div className="need-chips">{["普通人视角", "乱后恢复", "反例或限制", "缩短阅读量"].map((need) => <button className={draft.needs.includes(need) ? "selected" : ""} type="button" key={need} onClick={() => changeNeed(need)}>{need}</button>)}</div><label className="field"><span>补充要求（选填）</span><input value={draft.customNeed} onChange={(event) => setDraft((current) => ({ ...current, customNeed: event.target.value }))} /></label><button className="ui-button primary" type="button" onClick={() => { setDraft((current) => ({ ...current, batch: current.batch + 1 })); setMore(false); setAdjusting(false); }}>保留已选，换一批</button></section> : null}
        {loading ? <div className="context-skeleton" aria-busy="true"><span /><span /></div> : <><nav className="source-mobile-tabs" aria-label="史料工作区"><button aria-current={mobileView === "directory"} type="button" onClick={() => setMobileView("directory")}>目录</button><button aria-current={mobileView === "reader"} type="button" onClick={() => setMobileView("reader")}>阅读</button><button aria-current={mobileView === "selected"} type="button" onClick={() => setMobileView("selected")}>已选 {summary.selectedCount}</button></nav><div className="source-workspace" data-mobile-view={mobileView}>
          <section className="source-directory" aria-label="推荐史料目录"><header><div><h2>推荐目录</h2><p>已选 {summary.selectedCount} 条 {isLocalMode ? "· 证据覆盖将在组织证据与服务器检查中核实" : `· 覆盖 ${summary.coverage.filter(Boolean).length}/3 个子问题`}</p></div><button className="ui-button secondary compact" type="button" onClick={() => setAdjusting(true)}>调整需求并换一批</button></header><div className="source-list">{shown.map((source) => <SourceRow key={source.id} source={source} checked={draft.selectedIds.includes(source.id)} active={source.id === active?.id} onSelect={() => toggle(source.id)} onOpen={() => { setActiveId(source.id); setMobileView("reader"); }} />)}</div><button className="more-sources" type="button" onClick={() => setMore((value) => !value)}>{more ? "收起完整目录" : "查看全部可用史料"}</button></section>
          {active ? <article className="source-reader"><div className="source-tags"><span>{active.nature}</span>{active.questionIds.map((id) => <span key={id}>子问题 {id}</span>)}</div><h2>{active.title}</h2><p className="source-role">推荐用途：{active.role}</p><dl><div><dt>来源与定位</dt><dd>{active.institution} · {active.period}<br />{active.locator}</dd></div><div className="source-excerpt"><dt>课堂材料</dt><dd>{active.excerpt}</dd></div><div className="source-meaning"><dt>材料释义</dt><dd>{active.meaning}</dd></div><div className="interpretation"><dt>可论证什么</dt><dd>{active.interpretation}</dd></div><div><dt>使用时要注意</dt><dd>{active.contextNote} {active.limitation}</dd></div></dl><a aria-disabled={!active.url} href={active.url || undefined} target="_blank" rel="noreferrer">打开公开来源 ↗</a></article> : <article className="source-reader"><h2>暂无可读材料</h2><p>请加入公开或合成文本，或按本地运行说明装入合成目录。</p></article>}
          <aside className="selected-sources"><h2>已选证据</h2>{summary.selected.length ? <ol>{summary.selected.map((source) => <li key={source.id}><button type="button" onClick={() => { setActiveId(source.id); setMobileView("reader"); }}>{source.title}</button><IconButton icon="delete" tone="danger" label={`移除${source.title}`} onClick={() => toggle(source.id)} /></li>)}</ol> : <p>勾选目录中的史料后会集中显示在这里。</p>}<div className={summary.ready ? "coverage-ready" : "coverage-guide"}><strong>{summary.ready ? "证据结构已可用" : "还需要补足证据结构"}</strong><p>{summary.ready ? (isLocalMode ? "已选材料尚须建立证据关系并通过服务器检查。" : "已覆盖三个子问题，并包含至少三种史料性质。") : "建议选择4—6条，覆盖三个子问题和至少三种史料性质。"}</p>{summary.selectedCount > 6 ? <small>当前材料略多，建议移除与问题关联较弱的史料，给课堂阅读留出时间。</small> : null}</div></aside>
        </div></>}
        <section className="own-materials"><header><div><h2>加入自己的材料</h2><p>{isLocalMode ? "材料提交到本机 API 与数据库；不发送给外部模型。仅支持公开或合成数据。" : "与换一批分开处理；文件只在本机读取，不会上传。"}</p></div></header>{isLocalMode ? <fieldset className="local-material-consent"><legend>材料确认</legend><label><input type="checkbox" checked={absentSensitive} onChange={event => setAbsentSensitive(event.target.checked)} /><span><strong>仅含公开或合成内容</strong><small>不含个人、学生或敏感信息</small></span></label><label><input type="checkbox" checked={rightsAuthorized} onChange={event => setRightsAuthorized(event.target.checked)} /><span><strong>我有权在当前任务中处理正文</strong><small>选填；不勾选只保存元数据</small></span></label><p>授权声明不等于来源已核验；未知权利会阻断签发。</p></fieldset> : null}<div className="own-material-inputs"><label className="field"><span>公开网址</span><input type="url" value={urlValue} placeholder="https://…" onChange={(event) => setUrlValue(event.target.value)} /><span>材料摘录（选填）</span><textarea rows={3} value={urlExcerpt} onChange={(event) => setUrlExcerpt(event.target.value)} /><button className="ui-button secondary" type="button" disabled={adding} onClick={addUrl}>加入链接与摘录</button><small>{isLocalMode ? "本地仅登记网址；未启用网页抓取，摘录请通过文本文件加入。" : "演示版只保存你提供的链接和摘录，不会假装解析整个网页。"}</small></label><label className="file-drop"><span>上传 TXT 或 Markdown</span><span className="ui-button secondary"><UiIcon name="add" />选择文件</span><input className="visually-hidden" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void addFile(event.target.files?.[0])} /><small>PDF 与 Word 需要未来解析服务，本版不伪造结果。</small></label></div>{materialError ? <p className="field-error" role="alert">{materialError}</p> : null}{draft.ownMaterials.length ? <ul className="own-material-list">{draft.ownMaterials.map((item) => <li key={item.id}><span>{item.kind === "url" ? "链接" : "文本"}</span><strong>{item.name}</strong><IconButton icon="delete" tone="danger" label={`移除${item.name}`} onClick={() => setDraft((current) => ({ ...current, ownMaterials: current.ownMaterials.filter((material) => material.id !== item.id) }))} /></li>)}</ul> : null}</section>
        <PageActionBar status={summary.ready ? `已选 ${summary.selectedCount} 条` : "史料结构还不完整"} detail={summary.ready ? "确认后保存选择并继续组织证据" : "选择 4—8 条史料，并覆盖三个子问题与至少三种史料性质"}><button className="ui-button primary" type="button" disabled={!summary.ready} onClick={() => void saveSourceDraft(storageKey, draft).then(onNext, () => setSaveState("failed"))}>组织这些证据</button></PageActionBar>
      </main>
    </WorkbenchShell>
  );
}
