import { useInlineAi, InlineAiButton, InlineAiStatus } from "./InlineAi";
import { isLocalMode } from "./runtime-mode";
import { useEffect, useMemo, useState } from "react";
import { ClarifyingChoice, PreferredPlan, UnderstandingLine } from "./QuestionWorkspaceForm";
import { applyQuestionProposal, createQuestionDraft, createQuestionGuidance, normalizeQuestionDraft, validateQuestionConfirmation, validateQuestionInput, type InputType, type QuestionErrors, type QuestionWorkspaceDraft } from "./question-workspace";
import { loadContextDraft, loadQuestionDraft, loadSourceDraft, saveQuestionDraft } from "./teaching-context-store";
import { inquiryDirectionOptions, isSameTeachingContext, syntheticFixture, type TeachingContextDraft } from "./teaching-context";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

type Scenario = "ready" | "loading" | "empty" | "failure" | "timeout" | "offline" | "unavailable";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  const value = new URLSearchParams(window.location.search).get("p02-state");
  return (["loading", "empty", "failure", "timeout", "offline", "unavailable"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function focusQuestionError(errors: QuestionErrors) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()));
}

export function QuestionWorkspacePage({ taskId = "demo-tang-45m", onBack, onReturnContext, onNext }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onNext: () => void }) {
  const scenario = useMemo(readScenario, []);
  const initialContext = scenario === "empty" ? { ...syntheticFixture, inquiryQuestion: "" } : syntheticFixture;
  const [context, setContext] = useState<TeachingContextDraft>(initialContext);
  const [draft, setDraft] = useState<QuestionWorkspaceDraft>(() => createQuestionDraft(initialContext));
  const [choosingDirection, setChoosingDirection] = useState(!initialContext.inquiryQuestion.trim());
  const [errors, setErrors] = useState<QuestionErrors>({});
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const ai = useInlineAi(taskId, "questionGuidance", draft, setDraft, loading);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [upstreamChanged, setUpstreamChanged] = useState(false);
  const [sourceReached, setSourceReached] = useState(false);
  const [online, setOnline] = useState(() => scenario !== "offline" && (typeof navigator === "undefined" || navigator.onLine !== false));
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const guidance = draft.originalInput.trim() || !isLocalMode ? createQuestionGuidance(draft.originalInput || syntheticFixture.inquiryQuestion, context) : null;
  const selectedPlan = guidance ? (draft.focus === "single" ? guidance.alternative : guidance.primary) : null;

  useEffect(() => {
    if (scenario === "loading") {
      const timer = window.setTimeout(() => setLoading(false), 5000);
      return () => window.clearTimeout(timer);
    }
    if (scenario !== "ready") return;
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey)]).then(([storedContext, storedQuestion, storedSources]) => {
      const nextContext = storedContext || syntheticFixture;
      setContext(nextContext);
      setChoosingDirection(false);
      if (isLocalMode && storedQuestion) setDraft(storedQuestion);
      else if (!storedQuestion) setDraft(createQuestionDraft(nextContext));
      else if (!storedQuestion.contextSnapshot || !isSameTeachingContext(storedQuestion.contextSnapshot, nextContext)) {
        setDraft(createQuestionDraft(nextContext));
        setUpstreamChanged(true);
      } else setDraft(normalizeQuestionDraft(storedQuestion, nextContext));
      setSourceReached(Boolean(isLocalMode ? storedSources?.selectedIds.length : storedSources));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (isLocalMode || scenario === "unavailable" || loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveQuestionDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 450);
    return () => window.clearTimeout(timer);
  }, [draft, loading, scenario, storageKey]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const formGuidance = () => {
    const nextErrors = validateQuestionInput(draft.originalInput);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusQuestionError(nextErrors); return; }
    const next = createQuestionDraft({ ...context, inquiryQuestion: draft.originalInput });
    setDraft({ ...next, contextSnapshot: context });
    setChoosingDirection(false);
  };

  const choosePlan = (proposal: NonNullable<typeof selectedPlan>) => {
    setDraft((current) => applyQuestionProposal(current, proposal));
    setErrors({});
  };

  const updateDraft = (field: "centralQuestion" | "evidenceOutcome" | "subQuestions", value: string | string[]) => {
    setDraft((current) => ({ ...current, [field]: value, confirmed: false }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const openSources = () => {
    const nextErrors = validateQuestionConfirmation(draft, context);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusQuestionError(nextErrors); return; }
    const confirmed = { ...draft, confirmed: true };
    void (isLocalMode ? ai.commit(confirmed, () => saveQuestionDraft(storageKey, confirmed)) : saveQuestionDraft(storageKey, confirmed)).then(() => { setDraft(confirmed); onNext(); }, () => setSaveState("failed"));
  };

  return (
    <WorkbenchShell currentStep={1} reachedStep={sourceReached ? 2 : 1} currentLabel={draft.confirmed ? "探究问题已确认" : "探究问题"} nextLabel="查找史料" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 2 ? openSources() : undefined} stepActionLabels={sourceReached ? { 2: draft.confirmed ? "返回查找史料" : "确认修改并返回查找史料" } : undefined} stepHints={sourceReached && !draft.confirmed ? { 2: "有修改 · 确认后返回" } : undefined}>
      <main className="context-main question-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">从教学情境进入探究问题</p><h1>探究问题</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <InlineAiStatus ai={ai} />
        <p className="page-intro">先判断这是整课线索还是单个问题。整课线索会自动拆成递进子问题，并在后续组织史料与活动。</p>
        <details className="fixture-note"><summary>合成示范建议 · 可自由修改</summary><p>问题建议和学生任务为合成演示，不是实时 AI 或历史结论；本页不包含史料。</p></details>

        {!online ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>本机预生成方案仍可查看和修改；不会假装已调用在线服务。</span></div> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>内容仍保留在当前页面，关闭前请复制修改内容。</span></div> : null}
        {upstreamChanged ? <div className="status-banner info" role="status"><strong>教学情境已更新</strong><span>问题方案已按新的初步方向重新收束，请再次确认。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "补充建议已等待 30 秒" : "暂时无法补充更多建议"}</strong><p>已形成的本机方案和编辑内容都保留。你可以直接确认或修改，不需要重新填写。</p><small>追踪编号：DEMO-P02-001</small></section> : null}
        {Object.keys(errors).length ? <section className="error-summary" role="alert"><strong>请检查需要修改的内容</strong><p>当前方案仍然保留，第一处问题已获得焦点。</p></section> : null}

        {loading ? <div className="question-skeleton" aria-busy="true" aria-label="正在加载问题建议"><span /><span /></div> : (isLocalMode || (!choosingDirection && guidance && selectedPlan)) ? <section className="question-form form-section"><header className="inline-ai-section-heading"><h2>问题结构</h2><InlineAiButton ai={ai} target="all" label="生成整组问题" /></header><p>选择探究重点；可直接填写，也可在各栏目旁生成。</p><label className="field"><span>探究重点</span><select value={draft.focus} onChange={event => setDraft(current => ({ ...current, focus: event.target.value as "single" | "whole-lesson", subQuestions: event.target.value === "single" ? [] : current.subQuestions.length >= 2 ? current.subQuestions : isLocalMode ? ["", ""] : createQuestionDraft(context).subQuestions, confirmed: false }))}><option value="single">单个问题</option><option value="whole-lesson">整课线索</option></select></label><PreferredPlan key={draft.focus} draft={draft} errors={errors} disabled={ai.busy} aiControl={(target, label) => <InlineAiButton ai={ai} target={target} label={label} />} onChange={updateDraft} onConfirm={openSources} onNext={openSources} /></section> : choosingDirection || !guidance || !selectedPlan ? (
          <section className="missing-direction" aria-labelledby="missing-direction-heading">
            <p className="eyebrow">沿用上一页的课程范围</p><h2 id="missing-direction-heading">选一个探究方向</h2><p>上一页未填写粗略方向。现在选一个即可，也可以自行改写。</p>
            <div className="preset-choices" role="group" aria-label="选择探究方向">{inquiryDirectionOptions.map((direction) => <button type="button" key={direction} aria-pressed={draft.originalInput === direction} onClick={() => setDraft((current) => ({ ...current, originalInput: direction }))}>{direction}</button>)}</div>
            <label className="field" data-invalid={Boolean(errors.originalInput)}><span>初步方向</span><textarea name="originalInput" rows={2} maxLength={1000} value={draft.originalInput} aria-invalid={Boolean(errors.originalInput)} aria-describedby={errors.originalInput ? "question-originalInput-error" : undefined} onChange={(event) => setDraft((current) => ({ ...current, originalInput: event.target.value }))} />{errors.originalInput ? <p className="field-error" id="question-originalInput-error">{errors.originalInput}</p> : null}</label>
            <button className="context-primary" type="button" onClick={formGuidance}>形成首选方案</button>
          </section>
        ) : (
          <>
            <div className="question-columns">
              <section className="question-form form-section" aria-labelledby="question-form-heading">
                <header className="section-heading"><div><h2 id="question-form-heading">问题结构</h2><p>系统推荐“整课线索”，你可以随时改为单个问题。</p></div></header>
                <UnderstandingLine draft={draft} errors={errors} onTypeChange={(inputType: InputType) => setDraft((current) => ({ ...current, inputType, typeReason: `已按教师判断作为“${inputType}”处理。`, confirmed: false }))} />
                <ClarifyingChoice current={draft.focus} primary={guidance.primary} alternative={guidance.alternative} onChoose={choosePlan} />
                <PreferredPlan key={draft.focus} draft={draft} errors={errors} disabled={false} onChange={updateDraft} onConfirm={openSources} onNext={openSources} />
              </section>
            </div>
          </>
        )}
      </main>
    </WorkbenchShell>
  );
}
