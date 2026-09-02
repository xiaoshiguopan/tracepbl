import { useEffect, useMemo, useState } from "react";
import { loadQuestionDraft, loadSourceDraft, saveSourceDraft } from "./teaching-context-store";
import { emptySourceDraft, excludeSource, getSourceSetSummary, sourceFixture, toggleSourceSelection, type SourceDiscoveryDraft, type SourceRecord } from "./source-discovery";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const TASK_REF = "demo-tang-45m";
type Scenario = "ready" | "loading" | "empty" | "failure" | "timeout" | "offline" | "unavailable" | "invalid-material";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  const value = new URLSearchParams(window.location.search).get("p03-state");
  return (["loading", "empty", "failure", "timeout", "offline", "unavailable", "invalid-material"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function SourceReader({ source, selected, excluded, onToggle, onExclude }: { source: SourceRecord; selected: boolean; excluded: boolean; onToggle: () => void; onExclude: () => void }) {
  return (
    <article className="source-sheet" aria-labelledby="active-source-title">
      <header className="source-sheet-heading">
        <div><p className="eyebrow">{source.recommended ? "优先推荐" : "更多可用史料"} · {source.kind}</p><h2 id="active-source-title">{source.title}</h2></div>
        <span className="source-availability">有条件可用</span>
      </header>
      <p className="source-meta">{source.institution} · {source.period} · {source.locator}</p>
      <section className="source-excerpt" aria-label={source.excerptLabel}>
        <small>{source.excerptLabel}</small>
        <blockquote>{source.excerpt}</blockquote>
        <p>{source.contextNote}</p>
      </section>
      <section className="source-reason"><p className="eyebrow">为什么推荐</p><p>{source.reason}</p><small>推荐理由为合成演示建议，不是馆方结论。</small></section>
      <div className="source-boundaries">
        <section><span>可以帮助判断</span><p>{source.helps}</p></section>
        <section><span>不能单独证明</span><p>{source.cannotProve}</p></section>
      </div>
      <details className="source-basis"><summary>查看完整依据</summary><dl><div><dt>发现路径</dt><dd>{source.discoveredBy}</dd></div><div><dt>自动核验结果</dt><dd>有条件可用：来源与定位已登记，展示范围受许可限制。</dd></div><div><dt>权利与展示</dt><dd>{source.rights}</dd></div><div><dt>访问日期</dt><dd>2026-09-02</dd></div></dl></details>
      <footer className="source-actions">
        <button className={selected ? "source-selected" : "context-primary"} type="button" aria-pressed={selected} onClick={onToggle}>{selected ? "已选入本课 · 撤销" : "选入本课"}</button>
        <button type="button" aria-pressed={excluded} onClick={onExclude}>{excluded ? "恢复候选" : "不采用"}</button>
        <a href={source.url} target="_blank" rel="noreferrer">在官方来源查看<span className="sr-only">（新窗口）</span></a>
      </footer>
    </article>
  );
}

export function SourceDiscoveryPage({ onBack, onReturnContext, onReturnQuestion }: { onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void }) {
  const scenario = useMemo(readScenario, []);
  const visibleSources = scenario === "empty" ? [] : sourceFixture;
  const [activeId, setActiveId] = useState(sourceFixture[0].id);
  const [draft, setDraft] = useState<SourceDiscoveryDraft>(emptySourceDraft);
  const [question, setQuestion] = useState("依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？");
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [feedback, setFeedback] = useState("");
  const [materialSaved, setMaterialSaved] = useState(false);
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;
  const activeSource = visibleSources.find((source) => source.id === activeId) || visibleSources[0];
  const summary = getSourceSetSummary(draft);

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadQuestionDraft(storageKey), loadSourceDraft(storageKey)]).then(([storedQuestion, storedSources]) => {
      if (storedQuestion?.centralQuestion) setQuestion(storedQuestion.centralQuestion);
      if (storedSources) setDraft(storedSources);
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (loading || scenario === "unavailable") return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveSourceDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, scenario, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const toggleSelection = (source: SourceRecord) => {
    const selecting = !draft.selectedIds.includes(source.id);
    setDraft((current) => toggleSourceSelection(current, source.id));
    setFeedback(selecting ? `已将“${source.title}”选入本课史料组。` : `已从本课史料组移除“${source.title}”。`);
  };

  const toggleExcluded = (source: SourceRecord) => {
    const excluding = !draft.excludedIds.includes(source.id);
    setDraft((current) => excludeSource(current, source.id));
    setFeedback(excluding ? `已将“${source.title}”移到未采用结果。` : `已恢复“${source.title}”。`);
  };

  return (
    <WorkbenchShell currentStep={2} currentLabel="查找史料" nextLabel="组织证据" reachedStep={2} onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : undefined}>
      <main className="context-main sources-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">围绕问题建立证据组合</p><h1>查找史料</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">先读史料，再判断它是否值得进入你的证据组合。</p>
        <section className="inquiry-strip" aria-label="当前探究问题"><span>当前问题</span><p>{question}</p><button type="button" onClick={onReturnQuestion}>查看问题</button></section>
        <details className="fixture-note"><summary>预生成演示结果 · 已登记知识库 7 条 · 外部权威来源补充 3 条</summary><p>史料题名、必要短引和定位来自所列官方页面；推荐理由是合成演示建议。本页未连接在线检索、AI、数据库或真实上传。</p></details>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可阅读已缓存的 10 条演示结果；没有把未完成的外部检索标为可用。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "外部权威来源补充已等待 30 秒" : "外部权威来源补充暂时失败"}</strong><p>已登记知识库中的结果仍可阅读和选择，失败没有清空已有结果。</p><small>追踪编号：DEMO-P03-001</small></section> : null}
        {scenario === "invalid-material" ? <section className="error-summary" role="alert"><strong>自有材料信息还缺少来源</strong><p>请补充题名和稳定来源地址；公开候选不受影响，第一处错误会获得焦点。</p></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>选择仍保留在当前页面，关闭后可能无法恢复。</span></div> : null}
        {feedback ? <div className="selection-feedback" role="status">{feedback}</div> : null}

        {loading ? <div className="source-skeleton" aria-busy="true" aria-label="正在整理史料"><span /><span /></div> : !activeSource ? (
          <section className="source-empty"><p className="eyebrow">没有可用结果</p><h2>当前条件下没有达到展示门槛的史料</h2><p>知识库没有覆盖，外部来源也没有可合法展示的结果。可以返回调整问题，或录入你有权使用的材料元数据。</p><button className="context-primary" type="button" onClick={onReturnQuestion}>调整探究问题</button></section>
        ) : (
          <div className="source-workspace">
            <SourceReader source={activeSource} selected={draft.selectedIds.includes(activeSource.id)} excluded={draft.excludedIds.includes(activeSource.id)} onToggle={() => toggleSelection(activeSource)} onExclude={() => toggleExcluded(activeSource)} />
            <aside className="source-index" aria-label="推荐史料目录">
              <header><p className="eyebrow">为本课优先推荐</p><h2>推荐目录</h2><span>按问题匹配与类型互补排序</span></header>
              <ol>
                {sourceFixture.filter((source) => source.recommended).map((source, index) => <li key={source.id} data-active={source.id === activeId} data-selected={draft.selectedIds.includes(source.id)} data-excluded={draft.excludedIds.includes(source.id)}><button type="button" onClick={() => setActiveId(source.id)} aria-current={source.id === activeId ? "true" : undefined}><span>{String(index + 1).padStart(2, "0")}</span><strong>{source.title}</strong><small>{source.kind} · {draft.selectedIds.includes(source.id) ? "已选入" : draft.excludedIds.includes(source.id) ? "未采用" : "可阅读"}</small></button></li>)}
              </ol>
              <details className="more-sources"><summary>更多可用史料 6 条</summary><ul>{sourceFixture.filter((source) => !source.recommended).map((source) => <li key={source.id}><button type="button" onClick={() => setActiveId(source.id)}><strong>{source.title}</strong><small>{source.kind} · 查看登记</small></button></li>)}</ul></details>
              <section className="source-set-summary" aria-label="史料组合进度"><span>本课史料组</span><strong>{summary.selectedCount} / 建议 4—6 条</strong><p>{summary.kindCount} 种史料类型 · {summary.gap}</p></section>
              <details className="source-controls" open={scenario === "invalid-material" || undefined}><summary>调整查找范围与录入自有材料</summary><p>静态演示不发起真实搜索或上传；这里只保存你有权使用的材料元数据。</p><form onSubmit={(event) => { event.preventDefault(); setMaterialSaved(true); setFeedback("自有材料元数据已保存在本机；尚未完成在线核验。"); }}><label><span>材料题名</span><input name="materialTitle" required autoFocus={scenario === "invalid-material"} aria-invalid={scenario === "invalid-material" || undefined} aria-describedby={scenario === "invalid-material" ? "material-title-error" : undefined} /></label>{scenario === "invalid-material" ? <small className="field-error" id="material-title-error">请填写材料题名。</small> : null}<label><span>稳定来源地址</span><input name="materialUrl" type="url" required placeholder="https://…" /></label><button type="submit">保存材料元数据</button>{materialSaved ? <small>已保存在本机，未标记为已核验。</small> : null}</form></details>
              <button className="context-primary source-next" type="button" disabled={!summary.ready} onClick={() => setFeedback("本阶段演示开放至史料选择；组织证据页尚未实现。")}>选够后组织史料关系</button>
            </aside>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
