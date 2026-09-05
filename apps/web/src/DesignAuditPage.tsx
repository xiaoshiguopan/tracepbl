import { LocalOperationsPanel } from "./LocalOperationsPanel";
import { isLocalMode } from "./runtime-mode";
import { useEffect, useMemo, useState } from "react";
import { auditCategories, createAuditDraft, acceptAuditRecommendation, getAuditSummary, normalizeAuditDraft, rerunAudit, updateAuditReason, type AuditDraft, type AuditFinding, type AuditInput } from "./design-audit";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft, normalizeLessonDesignDraft } from "./lesson-design";
import { createRubricDraft, normalizeRubricDraft } from "./rubric-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadAuditDraft, loadContextDraft, loadEvidenceDraft, loadLessonDraft, loadQuestionDraft, loadRubricDraft, loadSourceDraft, saveAuditDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";
import { InlineNotice, PageActionBar } from "./UiControls";

const DEFAULT_QUESTION = "唐朝为何由盛转衰？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const defaultEvidence = createEvidenceMapDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS);
const defaultLesson = createLessonDesignDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS, defaultEvidence.relations);
const defaultRubric = createRubricDraft(defaultLesson.activities);
const defaultInput: AuditInput = { question: DEFAULT_QUESTION, selectedSourceIds: DEFAULT_SOURCE_IDS, evidence: defaultEvidence, lesson: defaultLesson, rubric: defaultRubric };

type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "timeout" | "offline" | "unavailable" | "missing-upstream" | "blocker" | "stale" | "success";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  const value = new URLSearchParams(window.location.search).get("p08-state");
  return (["loading", "empty", "validation", "failure", "timeout", "offline", "unavailable", "missing-upstream", "blocker", "stale", "success"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function createScenarioDraft(scenario: Scenario) {
  const base = createAuditDraft(defaultInput);
  if (scenario === "empty") return { ...base, findings: [], passedChecks: [] };
  if (scenario === "validation") {
    const accepted = acceptAuditRecommendation(base, "AUDIT-EVIDENCE-GAP");
    return { ...accepted, findings: accepted.findings.map((finding) => finding.id === "AUDIT-EVIDENCE-GAP" ? { ...finding, teacherReason: "太短" } : finding) };
  }
  if (scenario === "blocker") return { ...base, findings: base.findings.map((finding, index) => index === 0 ? { ...finding, severity: "blocker" as const, stage: "史料" as const, title: "一条史料引用与登记来源不相符", objectLabel: "来源完整性 · AUTH-SRC-001", basis: "必要短引无法与当前登记定位相互印证。", impact: "错配引用不能进入教学包。", recommendation: undefined } : finding) };
  if (scenario === "offline") return { ...base, findings: base.findings.map((finding, index) => index === 1 ? { ...finding, severity: "unknown" as const, title: "外部来源当前无法重新检查", objectLabel: "来源完整性 · 外部检查未完成", basis: "当前离线，不能确认外部页面是否仍可访问。", impact: "未知状态不能作为通过。" } : finding) };
  if (scenario === "failure" || scenario === "timeout") return { ...base, findings: base.findings.map((finding, index) => index === 1 ? { ...finding, severity: "unknown" as const, title: "部分设计检查尚未完成", objectLabel: "设计检查 · 系统结果未返回", basis: scenario === "timeout" ? "检查等待超过演示阈值，当前没有得到可复核结果。" : "检查过程失败，当前没有得到可复核结果。", impact: "未完成项目不能被计为通过。" } : finding) };
  if (scenario === "stale") return { ...base, staleCategories: ["活动—评价一致性" as const] };
  if (scenario === "success") return { ...acceptAuditRecommendation(base, "AUDIT-EVIDENCE-GAP"), completed: true };
  return base;
}

const severityCopy = { blocker: "阻断", confirmation: "需教师确认", suggestion: "建议改进", unknown: "检查未知" } as const;

function AuditFindingRow({ finding, error, onAccept, onReasonChange, onReturnSources, onReturnLesson, localAction }: { finding: AuditFinding; error?: string; onAccept: () => void; onReasonChange: (value: string) => void; onReturnSources: () => void; onReturnLesson: () => void; localAction?: { label: string; run: () => void } }) {
  return (
    <article className={`audit-finding ${finding.severity}`} data-finding={finding.severity} tabIndex={localAction || finding.severity === "blocker" || error ? -1 : undefined}>
      <div className="audit-stage"><span>{finding.stage}</span><i aria-hidden="true" /></div>
      <div className="audit-finding-body">
        <header><span>{finding.severity === "confirmation" && finding.resolution === "accepted" ? "教师已确认" : severityCopy[finding.severity]}</span><p>{finding.objectLabel}</p></header>
        <h3>{finding.title}</h3>
        <p className="audit-basis">{finding.basis}</p>
        <p className="audit-impact"><strong>影响</strong>{finding.impact}</p>
        {finding.severity === "confirmation" && finding.resolution === "pending" ? <section className="audit-recommendation"><span>首选处理</span><p>{finding.recommendation}</p><div><button className="context-primary" type="button" onClick={onAccept}>采用建议</button><button type="button" onClick={onReturnSources}>返回补充史料</button></div><small>采用后会形成一条可编辑的教师确认理由。</small></section> : null}
        {finding.severity === "confirmation" && finding.resolution === "accepted" ? <details className="audit-reason" open={Boolean(error) || undefined}><summary>已采用建议 · 查看或修改确认理由</summary><label><span>教师确认理由</span><textarea rows={3} minLength={10} maxLength={500} value={finding.teacherReason} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${finding.id}-error` : undefined} onChange={(event) => onReasonChange(event.target.value)} /></label>{error ? <p className="field-error" id={`${finding.id}-error`}>{error}</p> : null}</details> : null}
        {localAction ? <div className="audit-unknown-note"><p>{finding.id === "SERVER-AUDIT-REQUIRED" ? "先运行设计检查，再点“更新内容”查看具体问题；修复后重新检查。" : finding.recommendation || "查看对应内容并保存修改，再返回本页检查。"}</p><button className="ui-button secondary" type="button" onClick={localAction.run}>{localAction.label}</button></div> : <>
          {finding.severity === "suggestion" ? <button className="audit-text-action" type="button" onClick={onReturnLesson}>查看活动二</button> : null}
          {finding.severity === "blocker" ? <button className="audit-text-action blocker-action" type="button" onClick={onReturnSources}>返回修复这条史料</button> : null}
          {finding.severity === "unknown" ? <p className="audit-unknown-note">恢复检查条件后重新进入本页；当前不会把未知计为通过。</p> : null}
        </>}
      </div>
    </article>
  );
}

export function DesignAuditPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onReturnRubric, onNext = () => undefined }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void; onReturnLesson: () => void; onReturnRubric: () => void; onNext?: () => void }) {
  const scenario = useMemo(readScenario, []);
  const [input, setInput] = useState<AuditInput>(scenario === "missing-upstream" ? { ...defaultInput, rubric: { ...defaultRubric, dimensions: [] } } : defaultInput);
  const [draft, setDraft] = useState<AuditDraft>(() => createScenarioDraft(scenario));
  const [classLine, setClassLine] = useState(`${syntheticFixture.grade} · ${syntheticFixture.minutes} 分钟 · 唐朝由盛转衰`);
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState(scenario === "success" ? "设计检查已完成，可以进入最终确认与导出。" : "");
  const [showErrors, setShowErrors] = useState(scenario === "validation");
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const summary = getAuditSummary(draft);
  const hasReasonErrors = Object.keys(summary.reasonErrors).length > 0;
  const missingUpstream = input.rubric.dimensions.length === 0 || input.lesson.activities.length === 0 || input.selectedSourceIds.length === 0;

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadLessonDraft(storageKey), loadRubricDraft(storageKey), loadAuditDraft(storageKey)]).then(([context, questionDraft, sourceDraft, evidenceDraft, lessonDraft, rubricDraft, auditDraft]) => {
      if (isLocalMode && context && questionDraft && sourceDraft && evidenceDraft && lessonDraft && rubricDraft && auditDraft) { setClassLine(`${context.grade} · ${context.minutes} 分钟 · ${context.lesson}`); setInput({ question: questionDraft.centralQuestion, selectedSourceIds: sourceDraft.selectedIds, evidence: evidenceDraft, lesson: lessonDraft, rubric: rubricDraft }); setDraft(auditDraft); return; }
      const nextQuestion = questionDraft?.centralQuestion || DEFAULT_QUESTION;
      const nextSourceIds = sourceDraft?.selectedIds?.length ? sourceDraft.selectedIds : DEFAULT_SOURCE_IDS;
      const nextEvidence = evidenceDraft || createEvidenceMapDraft(nextQuestion, nextSourceIds, questionDraft?.subQuestions);
      const nextLesson = lessonDraft ? normalizeLessonDesignDraft(lessonDraft, nextQuestion, nextSourceIds, nextEvidence.relations) : createLessonDesignDraft(nextQuestion, nextSourceIds, nextEvidence.relations);
      const nextRubric = rubricDraft ? normalizeRubricDraft(rubricDraft, nextLesson.activities) : createRubricDraft(nextLesson.activities);
      const nextInput: AuditInput = { question: nextQuestion, selectedSourceIds: nextSourceIds, evidence: nextEvidence, lesson: nextLesson, rubric: nextRubric };
      setClassLine(`${context?.grade || syntheticFixture.grade} · ${context?.minutes || syntheticFixture.minutes} 分钟 · 唐朝由盛转衰`);
      setInput(nextInput);
      const demoCheck = createAuditDraft(nextInput);
      setDraft(auditDraft ? normalizeAuditDraft(auditDraft, nextInput) : demoCheck.findings.reduce((result, finding) => acceptAuditRecommendation(result, finding.id), demoCheck));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (isLocalMode || loading || scenario === "unavailable" || missingUpstream || (!draft.findings.length && !draft.passedChecks.length)) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveAuditDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, missingUpstream, scenario, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const accept = (findingId: string) => { setDraft((current) => acceptAuditRecommendation(current, findingId)); setFeedback("已采用首选处理。确认理由已代为填写，你仍可修改。"); };
  const locateCheck = () => { const button = document.getElementById("local-operation-run"); button?.scrollIntoView({ block: "center" }); button?.focus({ preventScroll: true }); setFeedback("已定位“运行设计检查”。点击运行，完成后用“更新内容”查看问题清单。"); };
  const localAction = (finding: AuditFinding) => finding.id === "SERVER-AUDIT-REQUIRED" ? { label: "前往运行检查", run: locateCheck } : ({ "问题": { label: "查看探究问题", run: onReturnQuestion }, "史料": { label: "查看相关史料", run: onReturnSources }, "论证": { label: "查看证据关系", run: onReturnEvidence }, "活动": { label: "查看活动与时间", run: onReturnLesson }, "量规": { label: "查看活动与评价关联", run: onReturnRubric } })[finding.stage];
  const rebuild = () => { if (isLocalMode) { locateCheck(); return; } setDraft(createAuditDraft(input)); setFeedback("已根据当前内容恢复预生成检查结果。"); };
  const rerun = () => { if (isLocalMode) { locateCheck(); return; } setDraft((current) => rerunAudit(current, input)); setFeedback("受影响项目已使用当前演示规则重新检查。"); };
  const complete = () => {
    if (!isLocalMode && draft.completed && summary.ready) { onNext(); return; }
    setShowErrors(true);
    if (!summary.ready) {
      setFeedback(summary.blockerCount ? `仍有 ${summary.blockerCount} 个阻断项，不能跳过。` : summary.unknownCount ? "仍有未完成或已失效的检查，不能把未知当作通过。" : "请先处理教师确认并检查理由。");
      requestAnimationFrame(() => (document.querySelector<HTMLElement>("[data-finding='blocker']")
        ?? document.querySelector<HTMLElement>("[aria-invalid='true']")
        ?? document.querySelector<HTMLElement>(".audit-finding.confirmation")
        ?? (isLocalMode ? document.querySelector<HTMLElement>(".audit-finding.unknown") : null))?.focus());
      return;
    }
    const completedDraft = { ...draft, completed: true };
    setDraft(completedDraft); setSaveState("saving");
    void saveAuditDraft(storageKey, completedDraft).then(() => { setSaveState("saved"); onNext(); }, () => { setSaveState("failed"); setFeedback("检查结果已确认，但本机保存失败。当前内容仍保留在本页。"); });
  };

  return (
    <WorkbenchShell currentStep={6} reachedStep={6} currentLabel="设计检查" nextLabel="最终确认与导出" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : step === 3 ? onReturnEvidence() : step === 4 ? onReturnLesson() : step === 5 ? onReturnRubric() : undefined}>
      <main className="context-main audit-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">只处理真正影响试教的事项</p><h1>设计检查</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        {isLocalMode ? <LocalOperationsPanel taskId={taskId} step={6} /> : null}
        <p className="page-intro">{isLocalMode ? "请运行服务器检查并载入结果；只有与当前修订一致的检查才能用于签发。" : "系统已经检查问题、史料、论证、活动和量规。通过项默认收起；有问题时直接告诉你影响和下一步。"}</p>
        <p className="audit-class-line">{classLine} · {input.selectedSourceIds.length} 条史料 · {input.lesson.activities.length} 段活动 · {input.rubric.dimensions.length} 个评价维度</p>
        <details className="fixture-note"><summary>{isLocalMode ? "服务器设计检查 · 与任务修订绑定" : "演示检查与理由已预填 · 可查看修改"}</summary><p>{isLocalMode ? "结果来自本机 Worker 对当前任务的确定性检查，不是实时联网核验或历史专业判断；未知状态不会计为通过。" : "演示预设了合成确认理由，方便直接体验完整流程，不代表你已作出真实确认。结果来自公开/合成 fixture，不是实时核验、AI 审计或安全授权；修改后仍按实际内容提示。"}</p></details>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>本机已有内容仍可查看，但外部来源无法重新检查，未知不会计为通过。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "设计检查已等待 30 秒" : "设计检查未完成"}</strong><p>已有内容和教师确认均已保留；未完成项目不会被标记为通过。</p><small>追踪编号：DEMO-P08-001</small></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>当前处理仍保留在此页，关闭后可能无法恢复。</span></div> : null}
        {feedback ? <div className="selection-feedback audit-feedback" role="status">{feedback}</div> : null}

        {loading ? <div className="audit-skeleton" aria-busy="true" aria-label="正在整理设计检查"><span /><span /></div> : missingUpstream ? (
          <section className="audit-upstream-empty" tabIndex={-1}><p className="eyebrow">检查条件还不完整</p><h2>{isLocalMode ? "先补齐这些内容，再运行检查" : "先确认评价量规，再检查整条设计链"}</h2><p>系统不会在缺少课堂活动或量规时输出通用“通过”。</p>{isLocalMode ? <div className="local-operation-actions">{!input.selectedSourceIds.length ? <button className="ui-button secondary" onClick={onReturnSources}>前往选择史料</button> : null}{!input.lesson.activities.length ? <button className="ui-button secondary" onClick={onReturnLesson}>前往设计活动</button> : null}{!input.rubric.dimensions.length ? <button className="ui-button secondary" onClick={onReturnRubric}>前往补充量规</button> : null}</div> : <button className="context-primary" type="button" onClick={onReturnRubric}>返回评价量规</button>}</section>
        ) : !draft.findings.length && !draft.passedChecks.length ? (
          <section className="audit-empty"><p className="eyebrow">尚未形成检查结果</p><h2>从当前问题、史料、活动和量规开始</h2><p>演示会建立一份可复核结果，不会连接真实审计服务。</p><button className="context-primary" type="button" onClick={rebuild}>形成预生成检查</button></section>
        ) : (
          <div className="audit-workspace audit-workspace-single">
            <section className="audit-galley" aria-labelledby="audit-galley-heading">
              <header><div><p className="eyebrow">通过项已经收起，先看会改变教学包的事项</p><h2 id="audit-galley-heading">需要你处理</h2></div><span>{draft.completed ? "检查完成" : `${summary.blockerCount + summary.confirmationCount + summary.unknownCount} 项待处理`}</span></header>
              {draft.staleCategories.length ? <InlineNotice tone="warning" actionLabel={isLocalMode ? "前往重新检查" : "重新检查"} onAction={rerun}>{isLocalMode ? "内容已更新，旧检查已失效。先重新检查，才能定位当前问题。" : `上游内容已有变化：${draft.staleCategories.join("、")}。建议复查，但不影响继续进入最终确认。`}</InlineNotice> : null}
              <div className="audit-findings">{draft.findings.map((finding) => <AuditFindingRow key={finding.id} finding={finding} error={showErrors ? summary.reasonErrors[finding.id] : undefined} onAccept={() => accept(finding.id)} onReasonChange={(value) => { setDraft((current) => updateAuditReason(current, finding.id, value)); setFeedback(""); }} onReturnSources={onReturnSources} onReturnLesson={onReturnLesson} localAction={isLocalMode ? localAction(finding) : undefined} />)}</div>
              <details className="passed-audit-checks"><summary>{draft.passedChecks.length} 项已通过的检查</summary><dl>{auditCategories.map((category) => {
                const checks = draft.passedChecks.filter((check) => check.category === category);
                return checks.length ? <div key={category}><dt>{category}</dt><dd>{checks.length} 项 · {checks.map((check) => check.label).join("；")}</dd></div> : null;
              })}</dl></details>
            </section>

            <PageActionBar status={summary.ready ? "可以进入最终确认" : `${summary.blockerCount + summary.confirmationCount + summary.unknownCount} 项待处理`} detail={summary.ready ? `${summary.passedCount} 项已通过；前端状态不代表安全授权` : summary.blockerCount ? `先修复 ${summary.blockerCount} 个阻断` : hasReasonErrors ? "完善教师确认理由" : "按上方引导处理即可"}>{summary.ready ? <button className="ui-button primary" type="button" onClick={complete}>{draft.completed ? "进入最终确认与导出" : "完成设计检查"}</button> : summary.unknownCount && draft.staleCategories.length ? <button className="ui-button primary" type="button" onClick={rerun}>重新检查受影响项</button> : <button className="ui-button primary" type="button" onClick={complete}>定位待处理项</button>}</PageActionBar>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
