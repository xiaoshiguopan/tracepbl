import { isLocalMode } from "./runtime-mode";
import { useEffect, useMemo, useState } from "react";
import { TeachingContextForm } from "./TeachingContextForm";
import {
  getContextSummary,
  getContextConflict,
  isSameTeachingContext,
  normalizeTeachingContextDraft,
  syntheticFixture,
  validateTeachingContext,
  type FieldErrors,
  type TeachingContextDraft,
} from "./teaching-context";
import { loadContextDraft, loadQuestionDraft, saveContextDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const emptyDraft: TeachingContextDraft = {
  stage: "",
  grade: "",
  textbook: "",
  lesson: "",
  lessonTypes: [],
  minutes: "",
  inquiryQuestion: "",
  priorKnowledge: "",
  learningNeeds: [],
  profileNote: "",
};

type Scenario = "ready" | "loading" | "empty" | "failure" | "timeout" | "offline" | "unavailable";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  const value = new URLSearchParams(window.location.search).get("p01-state");
  return (["loading", "empty", "failure", "timeout", "offline", "unavailable"] as const).includes(
    value as Exclude<Scenario, "ready">,
  )
    ? (value as Scenario)
    : "ready";
}

function focusFirstError(errors: FieldErrors) {
  const firstField = Object.keys(errors)[0];
  if (!firstField) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[name="${firstField}"]`)?.focus();
  }));
}

function ContextSummary({
  draft,
  summary,
}: {
  draft: TeachingContextDraft;
  summary: ReturnType<typeof getContextSummary>;
}) {
  return (
    <>
      <dl>
        <div><dt>课堂</dt><dd>{summary.classLine || "待补充"}</dd></div>
        <div><dt>教材</dt><dd>{draft.textbook || "待补充"}</dd></div>
        <div><dt>课次</dt><dd>{draft.lesson || "待补充"}</dd></div>
        <div><dt>初步方向</dt><dd>{summary.inquiryQuestion}</dd></div>
      </dl>
      <div className="brief-question"><span>下一步</span><p>把初步方向收束成可由史料回答、比较或质疑的探究问题。</p></div>
    </>
  );
}

export function TeachingContextPage({
  taskId = "demo-tang-45m",
  onBack,
  onNext,
}: {
  taskId?: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const scenario = useMemo(readScenario, []);
  const [draft, setDraft] = useState<TeachingContextDraft>(() =>
    scenario === "empty" ? emptyDraft : syntheticFixture,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(
    () => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedDraft, setConfirmedDraft] = useState<TeachingContextDraft | null>(null);
  const [questionReached, setQuestionReached] = useState(false);
  const [systemFailure, setSystemFailure] = useState(false);
  const [online, setOnline] = useState(() =>
    scenario === "offline" ? false : typeof navigator === "undefined" || navigator.onLine !== false,
  );
  const summary = getContextSummary(draft);
  const conflict = getContextConflict(draft);
  const dirty = confirmedDraft ? !isSameTeachingContext(draft, confirmedDraft) : true;
  const actionLabel = questionReached ? dirty ? "应用修改并返回探究问题" : "返回探究问题" : "继续形成探究问题";
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;

  useEffect(() => {
    if (scenario === "loading") {
      const timer = window.setTimeout(() => setLoading(false), 5000);
      return () => window.clearTimeout(timer);
    }
    if (scenario !== "ready") return;
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey)])
      .then(([storedContext, storedQuestion]) => {
          const nextDraft = storedContext ? (isLocalMode ? storedContext : normalizeTeachingContextDraft(storedContext)) : syntheticFixture;
        setDraft(nextDraft);
          if (storedQuestion && (!isLocalMode || storedQuestion.centralQuestion)) {
          setQuestionReached(true);
          const snapshot = storedQuestion.contextSnapshot
            ? normalizeTeachingContextDraft(storedQuestion.contextSnapshot)
            : nextDraft;
          setConfirmedDraft(snapshot);
        }
      }, () => setSaveState("failed"))
      .finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (isLocalMode || scenario === "unavailable" || loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveContextDraft(storageKey, draft).then(
        () => setSaveState("saved"),
        () => setSaveState("failed"),
      );
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, loading, scenario, storageKey]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const changeField = <Key extends keyof TeachingContextDraft>(
    key: Key,
    value: TeachingContextDraft[Key],
  ) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "stage" && value !== current.stage) next.grade = "";
      return next;
    });
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSystemFailure(false);
  };

  const toggleChoice = (
    key: "lessonTypes" | "learningNeeds",
    value: string,
  ) => {
    const values = draft[key];
    changeField(key, values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const submit = () => {
    const nextErrors = validateTeachingContext(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors);
      return;
    }
    setSystemFailure(false);
    if (scenario === "failure") {
      setSystemFailure(true);
      return;
    }
    if (scenario === "timeout") {
      setSubmitting(true);
      window.setTimeout(() => {
        setSubmitting(false);
        setSystemFailure(true);
      }, 1200);
      return;
    }
    const confirmedValue = { ...draft, lessonTypes: [...draft.lessonTypes], learningNeeds: [...draft.learningNeeds] };
    void saveContextDraft(storageKey, confirmedValue).then(() => { setConfirmedDraft(confirmedValue); setQuestionReached(true); onNext(); }, () => setSaveState("failed"));
  };

  const openQuestion = () => {
    if (dirty) submit();
    else onNext();
  };

  const undoChanges = () => {
    if (!confirmedDraft) return;
    setDraft({ ...confirmedDraft, lessonTypes: [...confirmedDraft.lessonTypes], learningNeeds: [...confirmedDraft.learningNeeds] });
    setErrors({});
    setSystemFailure(false);
  };

  return (
    <WorkbenchShell currentStep={0} reachedStep={questionReached ? 1 : 0} currentLabel={questionReached && !dirty ? "教学情境已确认" : "教学情境"} nextLabel="探究问题" onBack={onBack} onNavigateStep={(step) => step === 1 && openQuestion()} stepActionLabels={questionReached ? { 1: actionLabel } : undefined} stepHints={questionReached && dirty ? { 1: "有修改 · 确认后返回" } : undefined}>
        <main className="context-main" id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div><p className="eyebrow">从课堂问题开始</p><h1>教学情境</h1></div>
            <p className={`save-status ${saveState}`} aria-live="polite">
              {saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}
            </p>
          </header>
          <p className="page-intro">用最少信息确定课次、时间与匿名学情，后续页面会据此形成问题、选择史料并安排课堂活动。</p>

          <details className="fixture-note">
            <summary>合成示范课 · 可自由编辑</summary>
            <p>以下教学情境为虚构示例，不含真实教师、学生或班级数据。请勿填写个人或敏感信息。</p>
          </details>

          {!online ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可编辑，草稿会保存在本机；恢复网络后无需重新填写。</span></div> : null}
          {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>内容仍保留在当前页面。请在关闭前复制当前填写内容。</span></div> : null}
          {questionReached && dirty ? <div className="context-change-bar" role="status"><span><strong>教学情境有修改</strong>确认后，探究问题会按新情境重新收束。</span><button type="button" onClick={undoChanges}>撤销本次修改</button></div> : null}

          {loading ? (
            <div className="context-skeleton" aria-busy="true" aria-label="正在加载教学情境">
              <span /><span /><span /><span />
            </div>
          ) : (
            <>
              {Object.keys(errors).length ? (
                <section className="error-summary" role="alert" tabIndex={-1}>
                  <strong>请检查 {Object.keys(errors).length} 处内容</strong>
                  <p>已填写的内容仍然保留。第一处问题已获得焦点。</p>
                </section>
              ) : null}
              {conflict ? <section className="conflict-panel"><strong>课时与课型需要取舍</strong><p>{conflict}</p></section> : null}
              {systemFailure ? (
                <section className="system-failure" role="alert">
                  <strong>{scenario === "timeout" ? "确认教学情境超时" : "暂时无法确认教学情境"}</strong>
                  <p>你的输入和本机草稿都已保留。可以重试，不需要重新填写。</p>
                  <small>追踪编号：DEMO-P01-001</small>
                  <button type="button" onClick={submit}>重新确认</button>
                </section>
              ) : null}

              <div className="context-columns context-columns-single">
                <TeachingContextForm
                  draft={draft}
                  errors={errors}
                  disabled={submitting}
                  actionLabel={actionLabel}
                  onChange={changeField}
                  onToggle={toggleChoice}
                  onSubmit={submit}
                />

              </div>
              <details className="mobile-brief">
                <summary>查看当前教学情境</summary>
                <ContextSummary draft={draft} summary={summary} />
                {questionReached && !dirty ? <div className="success-feedback" role="status"><strong>教学情境已确认</strong><span>可以直接返回探究问题。</span></div> : null}
              </details>
            </>
          )}
        </main>
    </WorkbenchShell>
  );
}
