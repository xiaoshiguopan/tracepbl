import { useEffect, useMemo, useState } from "react";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft, type LessonActivity } from "./lesson-design";
import { createRubricDraft, getRubricSummary, normalizeRubricDraft, updateRubricDimension, type RubricDimension, type RubricDraft } from "./rubric-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadContextDraft, loadLessonDraft, loadRubricDraft, saveRubricDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";
import { IconButton, InlineNotice, PageActionBar, UiIcon } from "./UiControls";

const QUESTION = "唐朝为何由盛转衰？";
const SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const defaultEvidence = createEvidenceMapDraft(QUESTION, SOURCE_IDS);
const defaultLesson = createLessonDesignDraft(QUESTION, SOURCE_IDS, defaultEvidence.relations);
type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "offline" | "unavailable" | "missing-activities" | "success";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  const value = new URLSearchParams(window.location.search).get("p07-state");
  return (["loading", "empty", "validation", "failure", "offline", "unavailable", "missing-activities", "success"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function RubricRow({ dimension, errors, showErrors, startEditing, onSave, onRemove }: { dimension: RubricDimension; errors: string[]; showErrors: boolean; startEditing?: boolean; onSave: (change: Partial<Omit<RubricDimension, "id">>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(Boolean(startEditing));
  const [editDraft, setEditDraft] = useState(dimension);
  const invalid = showErrors && errors.length > 0;
  return <article id={`rubric-${dimension.id}`} className="rubric-row" data-invalid={invalid || undefined} tabIndex={invalid ? -1 : undefined}>
    <header>
      {editing ? <textarea className="rubric-title-input" aria-label="评价维度名称" rows={2} value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} autoFocus /> : <h3>{dimension.title}</h3>}
      <div className="icon-actions">{editing ? <><button type="button" className="ui-button quiet compact" onClick={() => { setEditDraft(dimension); setEditing(false); }}>取消</button><button type="button" className="ui-button secondary compact" onClick={() => { onSave(editDraft); setEditing(false); }}>保存</button></> : <><IconButton icon="edit" label={`修改${dimension.title}`} onClick={() => { setEditDraft(dimension); setEditing(true); }} /><IconButton icon="delete" tone="danger" label={`删除${dimension.title}`} onClick={onRemove} /></>}</div>
    </header>
    <div className="rubric-level-grid">{(editing ? editDraft : dimension).levels.map((item, index) => editing ? <label key={item.key}><strong>{item.label}</strong><textarea aria-label={`${editDraft.title}：${item.label}`} rows={4} value={item.description} onChange={(event) => setEditDraft((current) => ({ ...current, levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, description: event.target.value } : level) }))} /></label> : <section key={item.key}><strong>{item.label}</strong><p>{item.description}</p></section>)}</div>
    {invalid ? <div className="field-error" role="alert">{errors.join(" ")}</div> : null}
  </article>;
}

export function RubricDesignPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onNext = () => undefined }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void; onReturnLesson: () => void; onNext?: () => void }) {
  const scenario = useMemo(readScenario, []);
  const initialActivities = scenario === "missing-activities" ? [] : defaultLesson.activities;
  const initialDraft = createRubricDraft(initialActivities);
  const [activities, setActivities] = useState<LessonActivity[]>(initialActivities);
  const [draft, setDraft] = useState<RubricDraft>(scenario === "empty" ? { ...initialDraft, dimensions: [] } : scenario === "success" ? { ...initialDraft, confirmed: true } : initialDraft);
  const [classLine, setClassLine] = useState(`${syntheticFixture.grade} · ${syntheticFixture.minutes} 分钟`);
  const [loading, setLoading] = useState(scenario === "ready" || scenario === "loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [feedback, setFeedback] = useState("");
  const [showErrors, setShowErrors] = useState(scenario === "validation");
  const [removed, setRemoved] = useState<{ item: RubricDimension; index: number } | null>(null);
  const [newDimensionId, setNewDimensionId] = useState<string | null>(null);
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const summary = getRubricSummary(draft, activities);

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 1600); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadLessonDraft(storageKey), loadRubricDraft(storageKey)]).then(([context, lesson, rubric]) => {
      const nextActivities = lesson?.activities || defaultLesson.activities;
      setActivities(nextActivities); setClassLine(`${context?.grade || syntheticFixture.grade} · ${context?.minutes || syntheticFixture.minutes} 分钟`);
      setDraft(rubric ? normalizeRubricDraft(rubric, nextActivities) : createRubricDraft(nextActivities));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);
  useEffect(() => {
    if (loading || !activities.length || !draft.dimensions.length) return;
    setSaveState("saving"); const timer = window.setTimeout(() => void saveRubricDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 300);
    return () => window.clearTimeout(timer);
  }, [activities.length, draft, loading, storageKey]);
  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const remove = (item: RubricDimension, index: number) => { setDraft((current) => ({ ...current, confirmed: false, dimensions: current.dimensions.filter((dimension) => dimension.id !== item.id) })); setRemoved({ item, index }); setFeedback(`已删除“${item.title}”。`); };
  const undo = () => { if (!removed) return; setDraft((current) => { const dimensions = [...current.dimensions]; dimensions.splice(removed.index, 0, removed.item); return { ...current, dimensions, confirmed: false }; }); setRemoved(null); setFeedback("已恢复评价维度。"); };
  const add = () => {
    const id = `RUBRIC-${Date.now()}`;
    setNewDimensionId(id);
    setDraft((current) => ({ ...current, confirmed: false, dimensions: [...current.dimensions, { id, title: "新的评价维度", activityIds: activities.map((activity) => activity.id), levels: [{ key: "support", label: "需要支持", description: "写出需要教师支持时能观察到的表现。" }, { key: "expected", label: "达到要求", description: "写出达到本课要求时能观察到的表现。" }, { key: "strong", label: "表现充分", description: "写出进一步综合分析时能观察到的表现。" }], teacherEdited: true, status: "ready" }] }));
    requestAnimationFrame(() => document.getElementById(`rubric-${id}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }));
  };
  const confirm = () => {
    setShowErrors(true);
    if (!summary.ready) { setFeedback(activities.length ? "请先处理标出的评价描述。" : "请先返回设计活动，完成课堂活动。"); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-invalid]")?.focus()); return; }
    const next = { ...draft, confirmed: true }; setDraft(next);
    void saveRubricDraft(storageKey, next).then(onNext, () => { setSaveState("failed"); setFeedback("当前内容仍保留在页面中，请稍后重试。"); });
  };
  const navigateStep = (step: number) => [onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson][step]?.();

  return <WorkbenchShell currentStep={5} reachedStep={5} currentLabel="评价量规" nextLabel="设计检查" onBack={onBack} onNavigateStep={navigateStep}>
    <main className="context-main rubric-main" id="main-content" tabIndex={-1}>
      <header className="page-heading"><div><p className="eyebrow">按可观察的课堂表现评阅</p><h1>评价量规</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "保存失败" : "本机草稿"}</p></header>
      <p className="page-intro">系统依据本课问题、史料和学生产出形成五个维度。每项都描述课堂中能够观察到的表现。</p>
      <div className="rubric-meta"><span>{classLine}</span><span>个人历史解释为主要评价对象</span><button type="button" onClick={onReturnLesson}>查看课堂活动</button></div>
      <details className="fixture-note"><summary>这套量规如何对齐历史学科</summary><p>时空观念落实在阶段变化，史料实证落实在材料分析，多重因果与结论边界承接历史解释；唯物史观和家国情怀通过问题与材料语境综合体现，不拆成脱离任务的独立分数。</p></details>
      {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可在本机修改量规。</span></div> : null}
      {scenario === "failure" || saveState === "failed" ? <div className="status-banner warning" role="alert"><strong>本机保存暂不可用</strong><span>内容仍保留在本页，请不要关闭。</span></div> : null}
      {summary.reviewCount ? <InlineNotice tone="warning">课堂活动已有变化，建议浏览受影响的评价维度；不影响继续设计。</InlineNotice> : null}
      {feedback ? <InlineNotice actionLabel={removed ? "撤销" : undefined} onAction={removed ? undo : undefined}>{feedback}</InlineNotice> : null}
      {loading ? <div className="rubric-skeleton" aria-busy="true"><span /><span /><span /></div> : !activities.length ? <section className="rubric-upstream-empty" tabIndex={-1}><h2>先完成课堂活动</h2><p>量规需要对应学生在课堂中实际完成的任务。</p><button className="context-primary" type="button" onClick={onReturnLesson}>返回设计活动</button></section> : <>
        <button className="add-row-button" type="button" onClick={add}><UiIcon name="add" />添加评价维度</button>
        <div className="rubric-table-head" aria-hidden="true"><span>评价维度</span><span>需要支持</span><span>达到要求</span><span>表现充分</span></div>
        <section className="rubric-list" aria-label="评价维度">{draft.dimensions.map((dimension, index) => <RubricRow key={dimension.id} dimension={dimension} errors={summary.errors[dimension.id] || []} showErrors={showErrors} startEditing={dimension.id === newDimensionId} onSave={(change) => { setDraft((current) => updateRubricDimension(current, dimension.id, change)); setNewDimensionId(null); }} onRemove={() => remove(dimension, index)} />)}</section>
        <PageActionBar status={`${draft.dimensions.length} 个评价维度`} detail="三级标准均对应可观察的学生表现"><button className="ui-button primary" type="button" onClick={confirm}>继续设计检查</button></PageActionBar>
      </>}
    </main>
  </WorkbenchShell>;
}
