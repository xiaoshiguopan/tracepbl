import { useEffect, useMemo, useState } from "react";
import { TeachingContextForm } from "./TeachingContextForm";
import {
  getContextSummary,
  getContextConflict,
  normalizeTeachingContextDraft,
  syntheticFixture,
  validateTeachingContext,
  type FieldErrors,
  type TeachingContextDraft,
} from "./teaching-context";
import { loadContextDraft, saveContextDraft } from "./teaching-context-store";

const TASK_REF = "demo-tang-45m";
const emptyDraft: TeachingContextDraft = {
  stage: "",
  grade: "",
  textbook: "",
  lesson: "",
  lessonTypes: [],
  minutes: "",
  inquiryQuestion: "",
};

const steps = [
  "教学情境",
  "探究问题",
  "查找史料",
  "核验史料",
  "组织证据",
  "设计活动",
  "评价与检查",
  "最终确认",
  "导出",
];

type Scenario = "ready" | "loading" | "empty" | "failure" | "timeout" | "offline" | "unavailable";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
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

function StepRail({ confirmed }: { confirmed: boolean }) {
  return (
    <nav className="step-rail" aria-label="证据脉络">
      <p>证据脉络</p>
      <ol className="visible-steps">
        {steps.slice(0, 2).map((step, index) => (
          <li className={index === 0 ? confirmed ? "current complete" : "current" : "next"} key={step}>
            <span aria-hidden="true">{index + 1}</span>
            <strong aria-current={index === 0 ? "step" : undefined}>{step}<small>{index === 0 ? confirmed ? "已确认" : "正在填写" : "下一步"}</small></strong>
          </li>
        ))}
      </ol>
      <details className="future-steps">
        <summary>查看后续 7 步</summary>
        <ol start={3}>
          {steps.slice(2).map((step, index) => <li key={step}><span aria-hidden="true">{index + 3}</span><strong>{step}</strong></li>)}
        </ol>
      </details>
      <p className="permission-note">此处状态只帮助导航，不代表安全授权。</p>
    </nav>
  );
}

function TaskUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <main className="unavailable-state" id="main-content" tabIndex={-1}>
      <p className="eyebrow">无法打开任务</p>
      <h1>此任务当前不可用</h1>
      <p>它可能不存在、已被移除，或当前演示无法访问。这里不会显示任务标题、学情或其他内容。</p>
      <button className="context-primary" type="button" onClick={onBack}>返回演示首页</button>
    </main>
  );
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
  onBack,
}: {
  onBack: () => void;
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
  const [confirmed, setConfirmed] = useState(false);
  const [systemFailure, setSystemFailure] = useState(false);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(() =>
    scenario === "offline" ? false : typeof navigator === "undefined" || navigator.onLine,
  );
  const summary = getContextSummary(draft);
  const conflict = getContextConflict(draft);
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;

  useEffect(() => {
    if (scenario === "loading") {
      const timer = window.setTimeout(() => setLoading(false), 5000);
      return () => window.clearTimeout(timer);
    }
    if (scenario !== "ready") return;
    void loadContextDraft(storageKey)
      .then((stored) => stored && setDraft(normalizeTeachingContextDraft(stored)), () => setSaveState("failed"))
      .finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (scenario === "unavailable" || loading) return;
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
    if (confirmed) setNotice("已确认的情境发生变化；重新确认前，后续内容应视为待复核。");
    setConfirmed(false);
    setSystemFailure(false);
  };

  const toggleChoice = (
    key: "lessonTypes",
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
    setConfirmed(true);
    setNotice("");
  };

  return (
    <div className="workbench-shell">
      <a className="workbench-skip" href="#main-content">跳至主要内容</a>
      <header className="workbench-topbar">
        <button className="workbench-brand" type="button" onClick={onBack} aria-label="返回史证工坊首页">
          <span aria-hidden="true">史</span><strong>史证工坊</strong>
        </button>
        <div><span className="workbench-badge">公开演示</span><span className="local-data">仅存本机</span></div>
      </header>

      <div className="mobile-step"><span>第 1/9 步 · {confirmed ? "教学情境已确认" : "教学情境"}</span><strong>下一步：探究问题</strong></div>
      <div className="workbench-layout">
        <StepRail confirmed={confirmed} />
        <main className="context-main" id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div><p className="eyebrow">从课堂问题开始</p><h1>教学情境</h1></div>
            <p className={`save-status ${saveState}`} aria-live="polite">
              {saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}
            </p>
          </header>
          <p className="page-intro">先用最少信息确定课程边界。探究问题、史料条件和班级适配会在真正需要时再填写。</p>

          <details className="fixture-note">
            <summary>合成示范课 · 可自由编辑</summary>
            <p>以下教学情境为虚构示例，不含真实教师、学生或班级数据。请勿填写个人或敏感信息。</p>
          </details>

          {!online ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可编辑，草稿会保存在本机；恢复网络后无需重新填写。</span></div> : null}
          {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>内容仍保留在当前页面。请在关闭前复制当前填写内容。</span></div> : null}
          {notice ? <div className="status-banner info" role="status"><strong>步骤提示</strong><span>{notice}</span></div> : null}

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

              <div className="context-columns">
                <TeachingContextForm
                  draft={draft}
                  errors={errors}
                  disabled={submitting}
                  confirmed={confirmed}
                  onChange={changeField}
                  onToggle={toggleChoice}
                  onSubmit={submit}
                />

                <aside className="brief-panel desktop-brief" aria-labelledby="brief-heading">
                  <p className="eyebrow">当前教学情境</p>
                  <h2 id="brief-heading">{draft.lesson || "课程信息待补充"}</h2>
                  <ContextSummary draft={draft} summary={summary} />
                  {confirmed ? <div className="success-feedback" role="status"><strong>教学情境已确认</strong><span>下一步：收束探究问题。当前演示暂开放至本步骤。</span></div> : null}
                </aside>
              </div>
              <details className="mobile-brief">
                <summary>查看当前教学情境</summary>
                <ContextSummary draft={draft} summary={summary} />
                {confirmed ? <div className="success-feedback" role="status"><strong>教学情境已确认</strong><span>下一步：收束探究问题。当前演示暂开放至本步骤。</span></div> : null}
              </details>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
