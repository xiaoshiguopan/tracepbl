import { useEffect, useMemo, useState } from "react";
import { acceptAuditRecommendation, createAuditDraft, type AuditDraft, type AuditInput } from "./design-audit";
import { createEvidenceMapDraft } from "./evidence-map";
import { confirmTeachingPack, createFinalReviewDraft, getFinalReviewSummary, normalizeFinalReviewDraft, sanitizeTeachingPackFileName, type FinalReviewDraft, type FinalReviewInput } from "./final-review";
import { createLessonDesignDraft } from "./lesson-design";
import { createRubricDraft } from "./rubric-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadAuditDraft, loadContextDraft, loadFinalReviewDraft, loadLessonDraft, loadQuestionDraft, loadRubricDraft, loadSourceDraft, saveFinalReviewDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const TASK_REF = "demo-tang-45m";
const DEFAULT_QUESTION = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const defaultEvidence = createEvidenceMapDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS);
const defaultLesson = createLessonDesignDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS, defaultEvidence.relations);
const defaultRubric = createRubricDraft(defaultLesson.activities);
const auditInput: AuditInput = { question: DEFAULT_QUESTION, selectedSourceIds: DEFAULT_SOURCE_IDS, evidence: defaultEvidence, lesson: defaultLesson, rubric: defaultRubric };
const defaultAudit: AuditDraft = { ...acceptAuditRecommendation(createAuditDraft(auditInput), "AUDIT-EVIDENCE-GAP"), completed: true };
const defaultInput: FinalReviewInput = { question: DEFAULT_QUESTION, selectedSourceIds: DEFAULT_SOURCE_IDS, lesson: defaultLesson, rubric: defaultRubric, audit: defaultAudit };

type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "timeout" | "offline" | "unavailable" | "missing-upstream" | "success";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  const value = new URLSearchParams(window.location.search).get("p09-state");
  return (["loading", "empty", "validation", "failure", "timeout", "offline", "unavailable", "missing-upstream", "success"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function scenarioState(scenario: Scenario) {
  const input = scenario === "empty" ? { ...defaultInput, selectedSourceIds: [] } : scenario === "missing-upstream" || scenario === "failure" || scenario === "timeout" ? { ...defaultInput, audit: { ...defaultAudit, completed: false } } : defaultInput;
  const base = createFinalReviewDraft(input);
  if (scenario === "validation") return { input, draft: { ...confirmTeachingPack(base, input), fileName: "<>" } };
  if (scenario === "success") return { input, draft: confirmTeachingPack(base, input, "2026-09-02T08:00:00.000Z") };
  return { input, draft: base };
}

type ReturnActions = {
  onReturnContext: () => void;
  onReturnQuestion: () => void;
  onReturnSources: () => void;
  onReturnEvidence: () => void;
  onReturnLesson: () => void;
  onReturnRubric: () => void;
  onReturnAudit: () => void;
};

export function FinalReviewPage({ onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onReturnRubric, onReturnAudit }: { onBack: () => void } & ReturnActions) {
  const scenario = useMemo(readScenario, []);
  const initial = useMemo(() => scenarioState(scenario), [scenario]);
  const [input, setInput] = useState(initial.input);
  const [draft, setDraft] = useState<FinalReviewDraft>(initial.draft);
  const [classLine, setClassLine] = useState(`${syntheticFixture.grade} · ${syntheticFixture.minutes} 分钟 · 盛唐主题`);
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState(scenario === "success" ? "教学包已在本机确认，可以打开打印预览。" : "");
  const [showErrors, setShowErrors] = useState(scenario === "validation");
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;
  const summary = getFinalReviewSummary(input, draft);
  const sources = sourceFixture.filter((source) => input.selectedSourceIds.includes(source.id));
  const passedCount = input.audit.passedChecks.length + input.audit.findings.filter((finding) => finding.severity === "confirmation" && finding.resolution === "accepted").length;

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadLessonDraft(storageKey), loadRubricDraft(storageKey), loadAuditDraft(storageKey), loadFinalReviewDraft(storageKey)]).then(([context, question, source, lesson, rubric, audit, review]) => {
      const nextInput: FinalReviewInput = {
        question: question?.centralQuestion || DEFAULT_QUESTION,
        selectedSourceIds: source?.selectedIds || DEFAULT_SOURCE_IDS,
        lesson: lesson || defaultLesson,
        rubric: rubric || defaultRubric,
        audit: audit || defaultAudit,
      };
      setClassLine(`${context?.grade || syntheticFixture.grade} · ${context?.minutes || syntheticFixture.minutes} 分钟 · 盛唐主题`);
      setInput(nextInput);
      setDraft(review ? normalizeFinalReviewDraft(review, nextInput) : createFinalReviewDraft(nextInput));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (loading || scenario === "unavailable" || !summary.upstreamReady) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveFinalReviewDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, scenario, storageKey, summary.upstreamReady]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const confirm = () => {
    const next = confirmTeachingPack(draft, input);
    setDraft(next);
    setFeedback("这份教学包已由你在本机确认。现在可以打开打印预览。");
  };
  const openPrintPreview = () => {
    setShowErrors(true);
    if (!summary.canExport) {
      setFeedback(summary.fileNameError || "请先确认这份教学包。");
      requestAnimationFrame(() => document.querySelector<HTMLElement>(summary.fileNameError ? "[aria-invalid='true']" : ".review-signoff")?.focus());
      return;
    }
    const previousTitle = document.title;
    document.title = `${summary.fileName}｜史证工坊`;
    setFeedback("已打开系统打印窗口，请选择打印或另存为 PDF。");
    window.print();
    document.title = previousTitle;
  };
  const navigateStep = (step: number) => [onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onReturnRubric, onReturnAudit][step]?.();

  return (
    <WorkbenchShell currentStep={7} reachedStep={7} currentLabel="最终确认与导出" nextLabel="保存到本机" onBack={onBack} onNavigateStep={navigateStep}>
      <main className="context-main review-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">把已经确认的教学设计装订成可试教候选</p><h1>最终确认与导出</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">这里不再要求你重做检查。请浏览教学包将包含的内容和权利边界，再作一次最终确认。</p>
        <p className="review-class-line">{classLine}</p>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>这份教学包仍可在本机确认和打印；不会自动重放任何外部操作。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "读取交付状态已等待 30 秒" : "交付状态未能完整读取"}</strong><p>已知内容仍保留，但不会在状态未知时放行最终确认或导出。</p><small>追踪编号：DEMO-P09-001</small></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本机保存不可用</strong><span>当前确认仍留在本页；关闭页面后可能无法恢复。</span></div> : null}
        {feedback ? <div className="selection-feedback review-feedback" role="status">{feedback}</div> : null}

        {loading ? <div className="review-skeleton" aria-busy="true" aria-label="正在装订教学包"><span /><span /></div> : !summary.upstreamReady ? (
          <section className="review-upstream-empty" tabIndex={-1}><p className="eyebrow">交付条件还不完整</p><h2>{sources.length < 4 ? "先完成本课史料组" : "先完成设计检查"}</h2><p>最终确认不会把缺项、失效或未知状态包装成可试教候选。</p><button className="context-primary" type="button" onClick={sources.length < 4 ? onReturnSources : onReturnAudit}>{sources.length < 4 ? "返回查找史料" : "返回设计检查"}</button></section>
        ) : (
          <div className="review-workspace">
            <article className="review-galley" aria-labelledby="review-galley-heading">
              <header><div><p className="eyebrow">教学包装订清样</p><h2 id="review-galley-heading">本课交付内容</h2></div><span>{draft.approved ? "已由教师确认" : "等待最终确认"}</span></header>
              <p className="review-summary-line">{sources.length} 条史料　·　{input.lesson.activities.length} 段课堂活动　·　{input.rubric.dimensions.length} 个评价维度　·　设计检查已完成</p>
              <section className="review-question"><span>中心问题</span><p>{input.question}</p></section>

              <section className="review-chapter"><header><span>01</span><div><h3>探究问题</h3><p>问题、证据产物与结论边界已经在探究问题页确认。</p></div><button type="button" onClick={onReturnQuestion}>返回修改</button></header></section>
              <section className="review-chapter"><header><span>02</span><div><h3>史料与使用边界</h3><p>{sources.length} 条已选史料均保留来源、定位、价值与局限。</p></div><button type="button" onClick={onReturnSources}>返回修改</button></header><ol className="review-source-list">{sources.map((source) => <li key={source.id}><strong>{source.title}</strong><p>{source.excerpt}</p><small>{source.institution} · {source.locator} · {source.rights}</small></li>)}</ol></section>
              <section className="review-chapter"><header><span>03</span><div><h3>活动、支架与成果</h3><p>{input.lesson.activities.length} 段活动与转换连续占用 {input.lesson.activities.reduce((total, activity) => total + activity.minutes + activity.transitionMinutes, 0)} 分钟。</p></div><button type="button" onClick={onReturnLesson}>返回修改</button></header><ul className="review-compact-list">{input.lesson.activities.map((activity) => <li key={activity.id}><strong>{activity.title}</strong><span>{activity.studentAction} → {activity.evidenceProduct}</span></li>)}</ul></section>
              <section className="review-chapter"><header><span>04</span><div><h3>评价量规</h3><p>{input.rubric.dimensions.length} 个证据推理维度，不计算总分。</p></div><button type="button" onClick={onReturnRubric}>返回修改</button></header><p className="review-inline-items">{input.rubric.dimensions.map((dimension) => dimension.title).join("　/　")}</p></section>
              <section className="review-chapter"><header><span>05</span><div><h3>设计检查记录</h3><p>{passedCount} 项通过，保留 1 项非阻断改进建议。</p></div><button type="button" onClick={onReturnAudit}>查看详情</button></header></section>

              <section className="rights-preview"><p className="eyebrow">权利处理预览</p><h3>只带走课堂所需的可展示内容</h3><p>仅导出必要短引、事实性元数据、稳定定位和官方链接；不包含馆藏图片或长篇馆方说明。</p></section>

              <section className="review-signoff" tabIndex={-1}>
                <div><p className="eyebrow">教师签发</p><h3>{draft.approved ? "这份教学包已在本机确认" : "确认内容适合进入本地教学包"}</h3><p>复用你在前面步骤已经作出的决定，不再要求逐项打勾。本机确认不是专家认证或公开发布许可。</p></div>
                {draft.approved ? <span className="local-signature">本机确认<br /><small>可试教候选</small></span> : <button className="context-primary" type="button" onClick={confirm}>确认这份教学包</button>}
              </section>

              <section className="review-export" aria-labelledby="review-export-heading">
                <div><p className="eyebrow">保存到本机</p><h3 id="review-export-heading">打印或另存为 PDF</h3><p>使用浏览器原生打印能力，不上传内容，也不会产生费用。</p></div>
                <label><span>教学包文件名</span><input value={draft.fileName} disabled={!draft.approved} aria-invalid={showErrors && Boolean(summary.fileNameError) || undefined} aria-describedby={showErrors && summary.fileNameError ? "review-file-error" : undefined} onChange={(event) => { setDraft((current) => ({ ...current, fileName: sanitizeTeachingPackFileName(event.target.value) })); setFeedback(""); }} /></label>
                {showErrors && summary.fileNameError ? <p className="field-error" id="review-file-error">{summary.fileNameError}</p> : null}
                <button className="context-primary" type="button" disabled={!draft.approved} onClick={openPrintPreview}>{draft.approved ? "打开打印预览" : "确认后可打开打印预览"}</button>
                <small>打印窗口由你的浏览器或系统提供；请选择打印机，或选择“另存为 PDF”。</small>
              </section>
            </article>

            <aside className="review-proof" aria-labelledby="review-proof-heading">
              <header><p className="eyebrow">交付前最后一眼</p><h2 id="review-proof-heading">交付校样</h2></header>
              <ul><li><span aria-hidden="true">✓</span><strong>内容完整</strong><small>问题、史料、活动、支架与量规均已纳入</small></li><li><span aria-hidden="true">✓</span><strong>权利边界清楚</strong><small>馆藏图片与长篇说明不进入教学包</small></li><li><span aria-hidden="true">✓</span><strong>设计检查 {passedCount} 项通过</strong><small>没有阻断或未知状态</small></li><li><span aria-hidden="true">✓</span><strong>可试教候选</strong><small>不代表已试教、已认证或可公开再分发</small></li></ul>
              <p>前端展示只改善操作体验；真实读取、确认与导出权限仍须由后续服务端重新验证。</p>
            </aside>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
