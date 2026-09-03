import { useEffect, useMemo, useState } from "react";
import { getSourceSetSummary, normalizeSourceDraft, sourceFixture, toggleSourceSelection, type SourceDiscoveryDraft, type SourceRecord } from "./source-discovery";
import { loadEvidenceDraft, loadQuestionDraft, loadSourceDraft, saveSourceDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";
import { IconButton, PageActionBar, UiIcon } from "./UiControls";

function readScenario() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  return new URLSearchParams(window.location.search).get("p03-state") || "ready";
}

function SourceRow({ source, checked, active, onSelect, onOpen }: { source: SourceRecord; checked: boolean; active: boolean; onSelect: () => void; onOpen: () => void }) {
  return <article className={`source-row ${active ? "active" : ""}`}><label><input type="checkbox" checked={checked} aria-label={`选用${source.title}`} onChange={onSelect} /></label><button className="source-row-open" type="button" aria-current={active ? "true" : undefined} onClick={onOpen}><span><strong>{source.title}</strong><small>{source.nature} · {source.role}</small></span><span className="source-open-mark" aria-hidden="true">查看</span></button></article>;
}

export function SourceDiscoveryPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onNext }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onNext: () => void }) {
  const scenario = useMemo(readScenario, []);
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const [draft, setDraft] = useState<SourceDiscoveryDraft>(() => normalizeSourceDraft());
  const [activeId, setActiveId] = useState(sourceFixture[0].id);
  const [more, setMore] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlExcerpt, setUrlExcerpt] = useState("");
  const [materialError, setMaterialError] = useState("");
  const [mobileView, setMobileView] = useState<"directory" | "reader" | "selected">("directory");
  const [loading, setLoading] = useState(scenario === "ready");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [evidenceReached, setEvidenceReached] = useState(false);
  const summary = getSourceSetSummary(draft);
  const active = sourceFixture.find((source) => source.id === activeId) || sourceFixture[0];
  const shown = more ? sourceFixture : sourceFixture.filter((_, index) => (index + draft.batch * 6) % sourceFixture.length < 6);

  useEffect(() => {
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadQuestionDraft(storageKey)]).then(([saved, evidence]) => {
      setDraft(normalizeSourceDraft(saved));
      setEvidenceReached(Boolean(evidence));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);
  useEffect(() => {
    if (loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveSourceDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;
  const toggle = (id: string) => setDraft((current) => toggleSourceSelection(current, id));
  const changeNeed = (need: string) => setDraft((current) => ({ ...current, needs: current.needs.includes(need) ? current.needs.filter((item) => item !== need) : [...current.needs, need] }));
  const addUrl = () => {
    const value = urlValue.trim();
    try {
      const parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("protocol");
      setDraft((current) => ({ ...current, ownMaterials: [...current.ownMaterials, { id: crypto.randomUUID(), kind: "url", name: parsed.hostname, content: `${value}\n${urlExcerpt.trim()}`.trim() }] }));
      setUrlValue(""); setUrlExcerpt(""); setMaterialError("");
    } catch { setMaterialError("请填写以 http:// 或 https:// 开头的完整网址。"); }
  };
  const addFile = async (file?: File) => {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { setMaterialError("当前只支持 TXT 或 Markdown 文件；PDF 与 Word 暂不解析。"); return; }
    const content = (await file.text()).slice(0, 20000);
    setDraft((current) => ({ ...current, ownMaterials: [...current.ownMaterials, { id: crypto.randomUUID(), kind: "text", name: file.name, content }] }));
    setMaterialError("");
  };

  return (
    <WorkbenchShell currentStep={2} reachedStep={evidenceReached ? 3 : 2} currentLabel="查找史料" nextLabel="组织证据" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 3 ? onNext() : undefined}>
      <main className="context-main source-main" id="main-content">
        <header className="page-heading"><div><p className="eyebrow">围绕三个子问题</p><h1>查找史料</h1></div><p className={`save-status ${saveState}`}>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">勾选就是采用；没勾选就是暂不采用。先读清来源与限制，再决定是否放进本课。</p>
        <details className="fixture-note"><summary>公开史料与演示边界</summary><p>目录来自可定位的古籍、博物馆与学术机构公开页面。系统解读是教学建议，不冒充史料原文或实时AI检索。</p></details>
        {adjusting ? <section className="adjust-panel"><header><div><h2>这次想补哪类材料？</h2><p>选中具体缺口后换一批；已勾选史料始终保留。</p></div><IconButton icon="close" label="关闭调整需求" onClick={() => setAdjusting(false)} /></header><div className="need-chips">{["普通人视角", "乱后恢复", "反例或限制", "缩短阅读量"].map((need) => <button className={draft.needs.includes(need) ? "selected" : ""} type="button" key={need} onClick={() => changeNeed(need)}>{need}</button>)}</div><label className="field"><span>补充要求（选填）</span><input value={draft.customNeed} onChange={(event) => setDraft((current) => ({ ...current, customNeed: event.target.value }))} /></label><button className="ui-button primary" type="button" onClick={() => { setDraft((current) => ({ ...current, batch: current.batch + 1 })); setMore(false); setAdjusting(false); }}>保留已选，换一批</button></section> : null}
        {loading ? <div className="context-skeleton" aria-busy="true"><span /><span /></div> : <><nav className="source-mobile-tabs" aria-label="史料工作区"><button aria-current={mobileView === "directory"} type="button" onClick={() => setMobileView("directory")}>目录</button><button aria-current={mobileView === "reader"} type="button" onClick={() => setMobileView("reader")}>阅读</button><button aria-current={mobileView === "selected"} type="button" onClick={() => setMobileView("selected")}>已选 {summary.selectedCount}</button></nav><div className="source-workspace" data-mobile-view={mobileView}>
          <section className="source-directory" aria-label="推荐史料目录"><header><div><h2>推荐目录</h2><p>已选 {summary.selectedCount} 条 · 覆盖 {summary.coverage.filter(Boolean).length}/3 个子问题</p></div><button className="ui-button secondary compact" type="button" onClick={() => setAdjusting(true)}>调整需求并换一批</button></header><div className="source-list">{shown.map((source) => <SourceRow key={source.id} source={source} checked={draft.selectedIds.includes(source.id)} active={source.id === active.id} onSelect={() => toggle(source.id)} onOpen={() => { setActiveId(source.id); setMobileView("reader"); }} />)}</div><button className="more-sources" type="button" onClick={() => setMore((value) => !value)}>{more ? "收起完整目录" : "查看全部可用史料"}</button></section>
          <article className="source-reader"><div className="source-tags"><span>{active.nature}</span>{active.questionIds.map((id) => <span key={id}>子问题 {id}</span>)}</div><h2>{active.title}</h2><p className="source-role">推荐用途：{active.role}</p><dl><div><dt>来源与定位</dt><dd>{active.institution} · {active.period}<br />{active.locator}</dd></div><div className="source-excerpt"><dt>课堂材料</dt><dd>{active.excerpt}</dd></div><div className="source-meaning"><dt>材料释义</dt><dd>{active.meaning}</dd></div><div className="interpretation"><dt>可论证什么</dt><dd>{active.interpretation}</dd></div><div><dt>使用时要注意</dt><dd>{active.contextNote} {active.limitation}</dd></div></dl><a href={active.url} target="_blank" rel="noreferrer">打开公开来源 ↗</a></article>
          <aside className="selected-sources"><h2>已选证据</h2>{summary.selected.length ? <ol>{summary.selected.map((source) => <li key={source.id}><button type="button" onClick={() => { setActiveId(source.id); setMobileView("reader"); }}>{source.title}</button><IconButton icon="delete" tone="danger" label={`移除${source.title}`} onClick={() => toggle(source.id)} /></li>)}</ol> : <p>勾选目录中的史料后会集中显示在这里。</p>}<div className={summary.ready ? "coverage-ready" : "coverage-guide"}><strong>{summary.ready ? "证据结构已可用" : "还需要补足证据结构"}</strong><p>{summary.ready ? "已覆盖三个子问题，并包含至少三种史料性质。" : "建议选择4—6条，覆盖三个子问题和至少三种史料性质。"}</p>{summary.selectedCount > 6 ? <small>当前材料略多，建议移除与问题关联较弱的史料，给课堂阅读留出时间。</small> : null}</div></aside>
        </div></>}
        <section className="own-materials"><header><div><h2>加入自己的材料</h2><p>与换一批分开处理；文件只在本机读取，不会上传。</p></div></header><div className="own-material-inputs"><label className="field"><span>公开网址</span><input type="url" value={urlValue} placeholder="https://…" onChange={(event) => setUrlValue(event.target.value)} /><span>材料摘录（选填）</span><textarea rows={3} value={urlExcerpt} onChange={(event) => setUrlExcerpt(event.target.value)} /><button className="ui-button secondary" type="button" onClick={addUrl}>加入链接与摘录</button><small>演示版只保存你提供的链接和摘录，不会假装解析整个网页。</small></label><label className="file-drop"><span>上传 TXT 或 Markdown</span><span className="ui-button secondary"><UiIcon name="add" />选择文件</span><input className="visually-hidden" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void addFile(event.target.files?.[0])} /><small>PDF 与 Word 需要未来解析服务，本版不伪造结果。</small></label></div>{materialError ? <p className="field-error" role="alert">{materialError}</p> : null}{draft.ownMaterials.length ? <ul className="own-material-list">{draft.ownMaterials.map((item) => <li key={item.id}><span>{item.kind === "url" ? "链接" : "文本"}</span><strong>{item.name}</strong><IconButton icon="delete" tone="danger" label={`移除${item.name}`} onClick={() => setDraft((current) => ({ ...current, ownMaterials: current.ownMaterials.filter((material) => material.id !== item.id) }))} /></li>)}</ul> : null}</section>
        <PageActionBar status={summary.ready ? `已选 ${summary.selectedCount} 条，三个问题均有材料` : "史料结构还不完整"} detail={summary.ready ? "勾选状态已保存，可继续组织证据" : "选择 4—8 条史料，并覆盖三个子问题与至少三种史料性质"}><button className="ui-button primary" type="button" disabled={!summary.ready} onClick={() => void saveSourceDraft(storageKey, draft).then(onNext, () => setSaveState("failed"))}>组织这些证据</button></PageActionBar>
      </main>
    </WorkbenchShell>
  );
}
