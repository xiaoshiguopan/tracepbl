import { LocalOperationsPanel } from "./LocalOperationsPanel";
import { useTaskSources } from "./LocalTaskBoundary";
import { localExport } from "./local-operations";
import { exportManifestPack } from "./local-export-view";
import { useRef } from "react";
import { isLocalMode } from "./runtime-mode";
import { useEffect, useMemo, useState } from "react";
import { acceptAuditRecommendation, createAuditDraft, normalizeAuditDraft, type AuditDraft, type AuditInput } from "./design-audit";
import { createEvidenceMapDraft } from "./evidence-map";
import { confirmTeachingPack, createFinalReviewDraft, getFinalReviewSummary, normalizeFinalReviewDraft, sanitizeTeachingPackFileName, type FinalReviewDraft, type FinalReviewInput } from "./final-review";
import { createLessonDesignDraft, normalizeLessonDesignDraft } from "./lesson-design";
import { createRubricDraft, normalizeRubricDraft } from "./rubric-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture, type TeachingContextDraft } from "./teaching-context";
import { exportTeachingPack, type ExportFormat } from "./teaching-pack-export";
import { loadAuditDraft, loadContextDraft, loadEvidenceDraft, loadFinalReviewDraft, loadLessonDraft, loadQuestionDraft, loadRubricDraft, loadSourceDraft, saveFinalReviewDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";
import { InlineNotice } from "./UiControls";

const QUESTION = "唐朝为何由盛转衰？";
const SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const defaultEvidence = createEvidenceMapDraft(QUESTION, SOURCE_IDS);
const defaultLesson = createLessonDesignDraft(QUESTION, SOURCE_IDS, defaultEvidence.relations);
const defaultRubric = createRubricDraft(defaultLesson.activities);
const auditInput: AuditInput = { question: QUESTION, selectedSourceIds: SOURCE_IDS, evidence: defaultEvidence, lesson: defaultLesson, rubric: defaultRubric };
const defaultAudit: AuditDraft = { ...acceptAuditRecommendation(createAuditDraft(auditInput), "AUDIT-EVIDENCE-GAP"), completed: true };
const defaultInput: FinalReviewInput = { question: QUESTION, selectedSourceIds: SOURCE_IDS, lesson: defaultLesson, rubric: defaultRubric, audit: defaultAudit };
type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "offline" | "unavailable" | "missing-upstream" | "success";
type ReturnActions = { onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void; onReturnLesson: () => void; onReturnRubric: () => void; onReturnAudit: () => void };

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  const value = new URLSearchParams(window.location.search).get("p09-state");
  return (["loading", "empty", "validation", "failure", "offline", "unavailable", "missing-upstream", "success"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

export function FinalReviewPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onReturnRubric, onReturnAudit }: { taskId?: string; onBack: () => void } & ReturnActions) {
  const exportKeys = useRef<Record<string, string>>({});
  const scenario = useMemo(readScenario, []);
  const scenarioInput = scenario === "empty" ? { ...defaultInput, selectedSourceIds: [] } : scenario === "missing-upstream" || scenario === "failure" ? { ...defaultInput, audit: { ...defaultAudit, completed: false } } : defaultInput;
  const [context, setContext] = useState<TeachingContextDraft>(syntheticFixture);
  const [input, setInput] = useState<FinalReviewInput>(scenarioInput);
  const [draft, setDraft] = useState<FinalReviewDraft>(() => createFinalReviewDraft(scenarioInput));
  const [loading, setLoading] = useState(scenario === "ready" || scenario === "loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [exportState, setExportState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [feedback, setFeedback] = useState("");
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const summary = getFinalReviewSummary(input, { ...draft, approved: true });
  const sources = useTaskSources().filter((source) => input.selectedSourceIds.includes(source.id));

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 1600); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadLessonDraft(storageKey), loadRubricDraft(storageKey), loadAuditDraft(storageKey), loadFinalReviewDraft(storageKey)]).then(([storedContext, question, source, evidence, lesson, rubric, audit, review]) => {
      if (isLocalMode && storedContext && question && source && lesson && rubric && audit && review) { setContext(storedContext); setInput({ question: question.centralQuestion, selectedSourceIds: source.selectedIds, lesson, rubric, audit }); setDraft(review); return; }
      const nextQuestion = question?.centralQuestion || QUESTION;
      const nextSourceIds = source?.selectedIds?.length ? source.selectedIds : SOURCE_IDS;
      const nextEvidence = evidence || createEvidenceMapDraft(nextQuestion, nextSourceIds, question?.subQuestions);
      const nextLesson = lesson ? normalizeLessonDesignDraft(lesson, nextQuestion, nextSourceIds, nextEvidence.relations) : createLessonDesignDraft(nextQuestion, nextSourceIds, nextEvidence.relations);
      const nextRubric = rubric ? normalizeRubricDraft(rubric, nextLesson.activities) : createRubricDraft(nextLesson.activities);
      const nextAuditInput: AuditInput = { question: nextQuestion, selectedSourceIds: nextSourceIds, evidence: nextEvidence, lesson: nextLesson, rubric: nextRubric };
      const nextInput: FinalReviewInput = { question: nextQuestion, selectedSourceIds: nextSourceIds, lesson: nextLesson, rubric: nextRubric, audit: audit ? normalizeAuditDraft(audit, nextAuditInput) : defaultAudit };
      setContext(storedContext || syntheticFixture); setInput(nextInput); setDraft(review ? normalizeFinalReviewDraft(review, nextInput) : createFinalReviewDraft(nextInput));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);
  useEffect(() => {
    if (isLocalMode || loading || !summary.upstreamReady) return;
    setSaveState("saving"); const timer = window.setTimeout(() => void saveFinalReviewDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 300);
    return () => window.clearTimeout(timer);
  }, [draft, loading, storageKey, summary.upstreamReady]);
  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const runExport = async (format: ExportFormat) => {
    if (!summary.upstreamReady || summary.fileNameError) { setFeedback(summary.fileNameError || "请先按引导补齐教学包内容。"); return; }
    setExportState("working"); setFeedback("");
    try {
      const confirmed = confirmTeachingPack(draft, input); await saveFinalReviewDraft(storageKey, confirmed); setDraft(confirmed);
      if (isLocalMode) { const fingerprint = JSON.stringify([storageKey, format, summary.fileName]); exportKeys.current[fingerprint] ??= crypto.randomUUID(); const manifest = await localExport(storageKey, format, summary.fileName, exportKeys.current[fingerprint]); await exportTeachingPack(format, exportManifestPack(manifest)); }
      else await exportTeachingPack(format, { context, input, fileName: summary.fileName });
      setExportState("done"); setFeedback(`${format === "docx" ? "Word" : "PDF"} 教学包已开始下载。`);
    } catch (error) {
      setExportState("failed"); setFeedback(isLocalMode && error instanceof Error ? error.message : "导出失败，未生成文件。请保留本页内容并重试。");
    }
  };
  const navigateStep = (step: number) => [onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onReturnRubric, onReturnAudit][step]?.();

  return <WorkbenchShell currentStep={7} reachedStep={7} currentLabel="最终确认与导出" nextLabel="导出教学包" onBack={onBack} onNavigateStep={navigateStep}>
    <main className="context-main review-main" id="main-content" tabIndex={-1}>
      <header className="page-heading"><div><p className="eyebrow">最后浏览一次，然后带走可编辑的教学包</p><h1>最终确认与导出</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "保存失败" : "本机草稿"}</p></header>
        {isLocalMode ? <LocalOperationsPanel taskId={taskId} step={7} /> : null}
      <p className="page-intro">不再重复打勾或签发。下面就是即将导出的内容；需要修改时可直接返回对应页面。</p>
      {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>Word 仍可导出；PDF 首次生成需要读取项目内的中文字体资源。</span></div> : null}
      {scenario === "failure" || saveState === "failed" ? <div className="status-banner warning" role="alert"><strong>本机状态读取不完整</strong><span>不会把未知状态包装成可交付文件。</span></div> : null}
      {input.audit.staleCategories.length ? <InlineNotice tone="warning" actionLabel="查看设计检查" onAction={onReturnAudit}>上游内容已有变化，建议浏览设计检查；不影响预览和导出当前教学包。</InlineNotice> : null}
      {feedback ? <div className={`selection-feedback ${exportState === "failed" ? "error" : ""}`} role={exportState === "failed" ? "alert" : "status"}>{feedback}</div> : null}
      {loading ? <div className="review-skeleton" aria-busy="true"><span /><span /></div> : !summary.upstreamReady ? <section className="review-upstream-empty" tabIndex={-1}><h2>{sources.length < 4 ? "还缺少可用史料" : "设计检查尚未完成"}</h2><p>完成上游内容后，这里会自动保留已经做过的选择。</p><button className="context-primary" type="button" onClick={sources.length < 4 ? onReturnSources : onReturnAudit}>{sources.length < 4 ? "返回查找史料" : "返回设计检查"}</button></section> : <>
        <article className="delivery-preview">
          <header><div><span>历史证据探究教学包</span><h2>{context.lesson}</h2><p>{context.grade} · {context.minutes} 分钟 · {context.textbook}</p></div><button type="button" onClick={onReturnContext}>✎ 教学情境</button></header>
          <section><div className="delivery-section-title"><span>01</span><h3>探究问题</h3><button type="button" onClick={onReturnQuestion}>✎</button></div><p className="delivery-question">{input.question}</p></section>
          <section><div className="delivery-section-title"><span>02</span><h3>史料目录</h3><button type="button" onClick={onReturnSources}>✎</button></div><ol className="delivery-source-list">{sources.map((source) => <li key={source.id}><div><strong>{source.title}</strong><span>{source.nature}</span></div><blockquote>{source.excerpt}</blockquote><p><b>材料释义：</b>{source.meaning}</p><p><b>可论证什么：</b>{source.interpretation}</p><small>{source.institution} · {source.locator}</small></li>)}</ol></section>
          <section><div className="delivery-section-title"><span>03</span><h3>课堂活动</h3><button type="button" onClick={onReturnLesson}>✎</button></div><div className="delivery-activity-list">{input.lesson.activities.map((activity, index) => { const start = input.lesson.activities.slice(0, index).reduce((total, item) => total + item.minutes + item.transitionMinutes, 0); return <article key={activity.id}><span>{start}—{start + activity.minutes + activity.transitionMinutes}</span><div><strong>{activity.title}</strong><p>{activity.studentAction}</p><small>教师引导：{activity.scaffold}</small></div></article>; })}</div></section>
          <section><div className="delivery-section-title"><span>04</span><h3>评价量规</h3><button type="button" onClick={onReturnRubric}>✎</button></div><p>{input.rubric.dimensions.map((dimension) => dimension.title).join(" · ")}</p></section>
          <footer><span>教学包预览</span><p>包含来源定位、课堂材料、教学解读、课堂支架与评价量规。</p></footer>
        </article>
        <section className="export-panel" aria-labelledby="export-heading">
          <div><p className="eyebrow">导出到本机</p><h2 id="export-heading">带走完整教学包</h2><p>Word 便于继续修改；PDF 适合保持版式与分享审阅。</p></div>
          <label><span>文件名</span><input value={draft.fileName} onChange={(event) => setDraft((current) => ({ ...current, fileName: sanitizeTeachingPackFileName(event.target.value) }))} /></label>
          {summary.fileNameError ? <p className="field-error">{summary.fileNameError}</p> : null}
          <details className="export-menu"><summary className="ui-button primary">{exportState === "working" ? "正在生成…" : "导出教学包"}</summary><div><button type="button" disabled={exportState === "working"} onClick={() => void runExport("docx")}><strong>Word</strong><span>.docx · 可继续编辑</span></button><button type="button" disabled={exportState === "working"} onClick={() => void runExport("pdf")}><strong>PDF</strong><span>.pdf · 固定版式</span></button></div></details>
          <small>{isLocalMode ? "教学内容保存在本机数据库；文件依据服务器冻结版本在浏览器生成并下载，不发送给外部模型。" : "文件在当前浏览器内生成并下载，不上传教学内容。"}建议使用 Chrome 或 Edge；Word 文件已按 Word 与 LibreOffice 通用格式生成。</small>
        </section>
      </>}
    </main>
  </WorkbenchShell>;
}
