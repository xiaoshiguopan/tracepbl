import { useEffect, useMemo, useState } from "react";
import { auditCategories, createAuditDraft, acceptAuditRecommendation, getAuditSummary, normalizeAuditDraft, rerunAudit, updateAuditReason, type AuditDraft, type AuditFinding, type AuditInput } from "./design-audit";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft } from "./lesson-design";
import { createRubricDraft } from "./rubric-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadAuditDraft, loadContextDraft, loadEvidenceDraft, loadLessonDraft, loadQuestionDraft, loadRubricDraft, loadSourceDraft, saveAuditDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const TASK_REF = "demo-tang-45m";
const DEFAULT_QUESTION = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const defaultEvidence = createEvidenceMapDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS);
const defaultLesson = createLessonDesignDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS, defaultEvidence.relations);
const defaultRubric = createRubricDraft(defaultLesson.activities);
const defaultInput: AuditInput = { question: DEFAULT_QUESTION, selectedSourceIds: DEFAULT_SOURCE_IDS, evidence: defaultEvidence, lesson: defaultLesson, rubric: defaultRubric };

type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "timeout" | "offline" | "unavailable" | "missing-upstream" | "blocker" | "stale" | "success";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
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

function AuditFindingRow({ finding, error, onAccept, onReasonChange, onReturnSources, onReturnLesson }: { finding: AuditFinding; error?: string; onAccept: () => void; onReasonChange: (value: string) => void; onReturnSources: () => void; onReturnLesson: () => void }) {
  return (
    <article className={`audit-finding ${finding.severity}`} data-finding={finding.severity} tabIndex={finding.severity === "blocker" || error ? -1 : undefined}>
      <div className="audit-stage"><span>{finding.stage}</span><i aria-hidden="true" /></div>
      <div className="audit-finding-body">
        <header><span>{finding.severity === "confirmation" && finding.resolution === "accepted" ? "教师已确认" : severityCopy[finding.severity]}</span><p>{finding.objectLabel}</p></header>
        <h3>{finding.title}</h3>
        <p className="audit-basis">{finding.basis}</p>
        <p className="audit-impact"><strong>影响</strong>{finding.impact}</p>
        {finding.severity === "confirmation" && finding.resolution === "pending" ? <section className="audit-recommendation"><span>首选处理</span><p>{finding.recommendation}</p><div><button className="context-primary" type="button" onClick={onAccept}>采用建议</button><button type="button" onClick={onReturnSources}>返回补充史料</button></div><small>采用后会形成一条可编辑的教师确认理由。</small></section> : null}
        {finding.severity === "confirmation" && finding.resolution === "accepted" ? <details className="audit-reason" open={Boolean(error) || undefined}><summary>已采用建议 · 查看或修改确认理由</summary><label><span>教师确认理由</span><textarea rows={3} minLength={10} maxLength={500} value={finding.teacherReason} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${finding.id}-error` : undefined} onChange={(event) => onReasonChange(event.target.value)} /></label>{error ? <p className="field-error" id={`${finding.id}-error`}>{error}</p> : null}</details> : null}
        {finding.severity === "suggestion" ? <button className="audit-text-action" type="button" onClick={onReturnLesson}>查看活动二</button> : null}
        {finding.severity === "blocker" ? <button className="audit-text-action blocker-action" type="button" onClick={onReturnSources}>返回修复这条史料</button> : null}
        {finding.severity === "unknown" ? <p className="audit-unknown-note">恢复检查条件后重新进入本页；当前不会把未知计为通过。</p> : null}
      </div>
    </article>
  );
}

export function DesignAuditPage({ onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onReturnRubric }: { onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void; onReturnLesson: () => void; onReturnRubric: () => void }) {
  const scenario = useMemo(readScenario, []);
  const [input, setInput] = useState<AuditInput>(scenario === "missing-upstream" ? { ...defaultInput, rubric: { ...defaultRubric, dimensions: [] } } : defaultInput);
  const [draft, setDraft] = useState<AuditDraft>(() => createScenarioDraft(scenario));
  const [classLine, setClassLine] = useState(`${syntheticFixture.grade} · ${syntheticFixture.minutes} 分钟 · 盛唐主题`);
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState(scenario === "success" ? "设计检查已完成，可以进入最终确认与导出。" : "");
  const [showErrors, setShowErrors] = useState(scenario === "validation");
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;
  const summary = getAuditSummary(draft);
  const hasReasonErrors = Object.keys(summary.reasonErrors).length > 0;
  const missingUpstream = input.rubric.dimensions.length === 0 || input.lesson.activities.length === 0 || input.selectedSourceIds.length === 0;

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadLessonDraft(storageKey), loadRubricDraft(storageKey), loadAuditDraft(storageKey)]).then(([context, questionDraft, sourceDraft, evidenceDraft, lessonDraft, rubricDraft, auditDraft]) => {
      const nextInput: AuditInput = {
        question: questionDraft?.centralQuestion || DEFAULT_QUESTION,
        selectedSourceIds: sourceDraft?.selectedIds || DEFAULT_SOURCE_IDS,
        evidence: evidenceDraft || defaultEvidence,
        lesson: lessonDraft || defaultLesson,
        rubric: rubricDraft || defaultRubric,
      };
      setClassLine(`${context?.grade || syntheticFixture.grade} · ${context?.minutes || syntheticFixture.minutes} 分钟 · 盛唐主题`);
      setInput(nextInput);
      setDraft(auditDraft ? normalizeAuditDraft(auditDraft, nextInput) : createAuditDraft(nextInput));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (loading || scenario === "unavailable" || missingUpstream || (!draft.findings.length && !draft.passedChecks.length)) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveAuditDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, missingUpstream, scenario, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const accept = (findingId: string) => { setDraft((current) => acceptAuditRecommendation(current, findingId)); setFeedback("已采用首选处理。确认理由已代为填写，你仍可修改。"); };
  const rebuild = () => { setDraft(createAuditDraft(input)); setFeedback("已根据当前内容恢复预生成检查结果。"); };
  const rerun = () => { setDraft((current) => rerunAudit(current, input)); setFeedback("受影响项目已使用当前演示规则重新检查。"); };
  const complete = () => {
    setShowErrors(true);
    if (!summary.ready) {
      setFeedback(summary.blockerCount ? `仍有 ${summary.blockerCount} 个阻断项，不能跳过。` : summary.unknownCount ? "仍有未完成或已失效的检查，不能把未知当作通过。" : "请先处理教师确认并检查理由。");
      requestAnimationFrame(() => (document.querySelector<HTMLElement>("[data-finding='blocker']")
        ?? document.querySelector<HTMLElement>("[aria-invalid='true']")
        ?? document.querySelector<HTMLElement>(".audit-finding.confirmation"))?.focus());
      return;
    }
    const completedDraft = { ...draft, completed: true };
    setDraft(completedDraft); setSaveState("saving");
    void saveAuditDraft(storageKey, completedDraft).then(() => { setSaveState("saved"); setFeedback("设计检查已完成。最终确认与导出尚未实现。"); }, () => { setSaveState("failed"); setFeedback("检查结果已确认，但本机保存失败。当前内容仍保留在本页。"); });
  };

  return (
    <WorkbenchShell currentStep={6} reachedStep={6} currentLabel="设计检查" nextLabel="最终确认与导出" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : step === 3 ? onReturnEvidence() : step === 4 ? onReturnLesson() : step === 5 ? onReturnRubric() : undefined}>
      <main className="context-main audit-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">在交付前，把整条证据链逐项过一遍</p><h1>设计检查</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">系统已检查问题、史料、论证、活动和量规。你只需处理真正影响课堂使用的地方。</p>
        <p className="audit-class-line">{classLine}</p>
        <section className="audit-chain" aria-label="当前证据设计链"><span>探究问题</span><i>✓</i><span>{input.selectedSourceIds.length} 条史料</span><i>✓</i><span>{input.evidence.claims.length} 个待判断命题</span><i>✓</i><span>{input.lesson.activities.length} 段课堂活动</span><i>✓</i><span>{input.rubric.dimensions.length} 个评价维度</span></section>
        <details className="fixture-note"><summary>预生成演示检查 · 内容未变化时可复用</summary><p>结果来自当前公开/合成 fixture 和确定性前端规则，不是实时链接检查、AI 审计或安全授权；未知状态不会计为通过。</p></details>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>本机已有内容仍可查看，但外部来源无法重新检查，未知不会计为通过。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "设计检查已等待 30 秒" : "设计检查未完成"}</strong><p>已有内容和教师确认均已保留；未完成项目不会被标记为通过。</p><small>追踪编号：DEMO-P08-001</small></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>当前处理仍保留在此页，关闭后可能无法恢复。</span></div> : null}
        {feedback ? <div className="selection-feedback audit-feedback" role="status">{feedback}</div> : null}

        {loading ? <div className="audit-skeleton" aria-busy="true" aria-label="正在整理设计检查"><span /><span /></div> : missingUpstream ? (
          <section className="audit-upstream-empty" tabIndex={-1}><p className="eyebrow">检查条件还不完整</p><h2>先确认评价量规，再检查整条设计链</h2><p>系统不会在缺少课堂活动或量规时输出通用“通过”。</p><button className="context-primary" type="button" onClick={onReturnRubric}>返回评价量规</button></section>
        ) : !draft.findings.length && !draft.passedChecks.length ? (
          <section className="audit-empty"><p className="eyebrow">尚未形成检查结果</p><h2>从当前问题、史料、活动和量规开始</h2><p>演示会建立一份可复核结果，不会连接真实审计服务。</p><button className="context-primary" type="button" onClick={rebuild}>形成预生成检查</button></section>
        ) : (
          <div className="audit-workspace">
            <section className="audit-galley" aria-labelledby="audit-galley-heading">
              <header><div><p className="eyebrow">通过项已经收起，先看会改变教学包的事项</p><h2 id="audit-galley-heading">需要你处理</h2></div><span>{draft.completed ? "检查完成" : `${summary.blockerCount + summary.confirmationCount + summary.unknownCount} 项待处理`}</span></header>
              {draft.staleCategories.length ? <section className="audit-stale" role="alert"><strong>上游内容已有变化</strong><p>{draft.staleCategories.join("、")}需要重新检查；其他仍有效结果已保留。</p><button type="button" onClick={rerun}>重新检查受影响项</button></section> : null}
              <div className="audit-proof-line" aria-hidden="true"><span>问题</span><span>史料</span><span>论证</span><span>活动</span><span>量规</span></div>
              <div className="audit-findings">{draft.findings.map((finding) => <AuditFindingRow key={finding.id} finding={finding} error={showErrors ? summary.reasonErrors[finding.id] : undefined} onAccept={() => accept(finding.id)} onReasonChange={(value) => { setDraft((current) => updateAuditReason(current, finding.id, value)); setFeedback(""); }} onReturnSources={onReturnSources} onReturnLesson={onReturnLesson} />)}</div>
              <details className="passed-audit-checks"><summary>{draft.passedChecks.length} 项已通过的检查</summary><dl>{auditCategories.map((category) => {
                const checks = draft.passedChecks.filter((check) => check.category === category);
                return checks.length ? <div key={category}><dt>{category}</dt><dd>{checks.length} 项 · {checks.map((check) => check.label).join("；")}</dd></div> : null;
              })}</dl></details>
            </section>

            <aside className="audit-ledger" aria-labelledby="audit-ledger-heading">
              <header><p className="eyebrow">交付前校样</p><h2 id="audit-ledger-heading">检查校样</h2></header>
              <dl><div><dt>{summary.totalCount}</dt><dd>项检查</dd></div><div><dt>{summary.blockerCount}</dt><dd>个阻断</dd></div><div><dt>{summary.confirmationCount}</dt><dd>项待确认</dd></div><div><dt>{summary.suggestionCount}</dt><dd>项建议</dd></div><div><dt>{summary.passedCount}</dt><dd>项通过</dd></div>{summary.unknownCount ? <div><dt>{summary.unknownCount}</dt><dd>项未知或失效</dd></div> : null}</dl>
              <section className={summary.ready ? "audit-ready" : "audit-not-ready"}><strong>{draft.completed ? "本次设计检查已完成" : summary.ready ? "可以完成本次检查" : "当前还不能进入交付"}</strong><p>{summary.ready ? "所有阻断、未知和教师确认都已处理。" : summary.blockerCount ? `先修复 ${summary.blockerCount} 个阻断项。` : summary.unknownCount ? "先重新检查未知或已失效项目。" : hasReasonErrors ? "完善教师确认理由后即可完成本次检查。" : `处理 ${summary.confirmationCount} 项教师确认后即可完成本次检查。`}</p></section>
              <p className="audit-permission">前端状态只帮助判断，不代表安全授权。</p>
              {summary.ready ? <button className="context-primary audit-next" type="button" onClick={complete}>{draft.completed ? "检查已完成" : "完成设计检查"}</button> : summary.unknownCount && draft.staleCategories.length ? <button className="context-primary audit-next" type="button" onClick={rerun}>重新检查受影响项</button> : hasReasonErrors ? <button className="context-primary audit-next" type="button" onClick={complete}>完善教师确认理由</button> : <button className="context-primary audit-next" type="button" disabled>{summary.blockerCount ? `先修复 ${summary.blockerCount} 个阻断` : summary.unknownCount ? "等待未知检查完成" : `先处理 ${summary.confirmationCount} 项待确认`}</button>}
              <p className="next-step-note">下一步：最终确认与导出（尚未实现）</p>
            </aside>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
