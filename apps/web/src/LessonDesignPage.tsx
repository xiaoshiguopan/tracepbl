import { useInlineAi, InlineAiButton, InlineAiStatus } from "./InlineAi";
import { useTaskSources } from "./LocalTaskBoundary";
import { isLocalMode } from "./runtime-mode";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft, getLessonDesignSummary, normalizeLessonDesignDraft, updateLessonActivity, type LessonActivity, type LessonDesignDraft } from "./lesson-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadContextDraft, loadEvidenceDraft, loadLessonDraft, loadQuestionDraft, loadSourceDraft, saveLessonDraft } from "./teaching-context-store";
import { DragHandle, IconButton, InlineNotice, PageActionBar, SelectControl } from "./UiControls";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const DEFAULT_QUESTION = "唐朝为何由盛转衰？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const actionPresets = ["提取并标注史料信息", "比较不同史料或阶段", "归纳多重原因并建立联系", "引用史料形成个人解释"];

function readScenario() {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  return new URLSearchParams(window.location.search).get("p06-state") || "ready";
}

function ActivityCard({ activity, index, startMinute, selectedIds, aiControl, onChange, onDelete }: { aiControl?: ReactNode; activity: LessonActivity; index: number; startMinute: number; selectedIds: string[]; onChange: (change: Partial<Omit<LessonActivity, "id">>) => void; onDelete: () => void }) {
  const sourceById = new Map(useTaskSources().map(source => [source.id, source]));
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(activity);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id });
  const style = transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`, transition } : { transition };
  const update = <Key extends keyof LessonActivity>(key: Key, value: LessonActivity[Key]) => setEditDraft((current) => ({ ...current, [key]: value }));
  const cancel = () => { setEditDraft(activity); setEditing(false); };
  const save = () => { onChange(editDraft); setEditing(false); };
  return <article data-inline-editing={isLocalMode && editing ? "true" : undefined} ref={setNodeRef} id={`activity-${activity.id}`} className={`activity-card ${isDragging ? "is-dragging" : ""}`} style={style}>
    <header className="activity-card-title"><DragHandle label={`拖动活动${index + 1}排序`} {...attributes} {...listeners} /><div><small>活动 {index + 1} · {startMinute}—{startMinute + activity.minutes} 分钟</small>{editing ? <input className="activity-title-input" value={editDraft.title} onChange={(event) => update("title", event.target.value)} /> : <h2>{activity.title}</h2>}</div><div className="activity-card-actions">{editing ? <><button className="ui-button quiet compact" type="button" onClick={cancel}>取消</button><button className="ui-button secondary compact" type="button" onClick={save}>保存修改</button></> : <><button className="ui-button quiet compact" type="button" onClick={() => { setEditDraft(activity); setEditing(true); }}><span>修改</span></button><IconButton icon="delete" tone="danger" label={`删除${activity.title}`} onClick={onDelete} /></>}</div></header>{aiControl}
    {editing ? <div className="activity-edit-grid"><label><span>活动时间</span><span className="input-suffix"><input type="number" min="1" max="60" value={editDraft.minutes} onChange={(event) => update("minutes", Number(event.target.value))} /><span>分钟</span></span></label><label><span>学生动作</span><SelectControl value={actionPresets.includes(editDraft.studentAction) ? editDraft.studentAction : ""} onChange={(event) => event.target.value && update("studentAction", event.target.value)}><option value="">自定义动作</option>{actionPresets.map((item) => <option key={item}>{item}</option>)}</SelectControl><textarea value={editDraft.studentAction} onChange={(event) => update("studentAction", event.target.value)} /></label><fieldset><legend>使用史料</legend><div className="activity-source-options">{selectedIds.map((id) => <label key={id}><input type="checkbox" checked={editDraft.sourceIds.includes(id)} onChange={() => update("sourceIds", editDraft.sourceIds.includes(id) ? editDraft.sourceIds.filter((item) => item !== id) : [...editDraft.sourceIds, id])} /><span>{sourceById.get(id)?.title}</span></label>)}</div></fieldset><label><span>课堂成果</span><textarea value={editDraft.evidenceProduct} onChange={(event) => update("evidenceProduct", event.target.value)} /></label><label><span>学生最可能卡住</span><textarea value={editDraft.difficulty} onChange={(event) => update("difficulty", event.target.value)} /></label><label><span>教师追问或简化问题</span><textarea value={editDraft.scaffold} onChange={(event) => update("scaffold", event.target.value)} /></label></div> : <dl className="activity-read-grid"><div><dt>使用史料</dt><dd><ul>{activity.sourceIds.map((id) => <li key={id}>{sourceById.get(id)?.title || id}</li>)}</ul></dd></div><div><dt>学生动作</dt><dd>{activity.studentAction}</dd></div><div><dt>课堂成果</dt><dd>{activity.evidenceProduct}</dd></div><div className="activity-support"><dt>学生最可能卡住</dt><dd>{activity.difficulty}</dd><dt>教师追问或简化问题</dt><dd>{activity.scaffold}</dd></div></dl>}
  </article>;
}

export function LessonDesignPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onNext = () => undefined }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void; onNext?: () => void }) {
  const scenario = useMemo(readScenario, []);
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const defaultEvidence = createEvidenceMapDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [grade, setGrade] = useState(syntheticFixture.grade);
  const [availableMinutes, setAvailableMinutes] = useState(45);
  const [selectedIds, setSelectedIds] = useState(DEFAULT_SOURCE_IDS);
  const [draft, setDraft] = useState<LessonDesignDraft>(() => createLessonDesignDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS, defaultEvidence.relations));
  const [loading, setLoading] = useState(scenario === "ready");
  const ai = useInlineAi(taskId, "lesson", draft, setDraft, loading);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [removed, setRemoved] = useState<{ activity: LessonActivity; index: number } | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const summary = getLessonDesignSummary(draft, availableMinutes);

  useEffect(() => {
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadLessonDraft(storageKey)]).then(([context, questionDraft, sourceDraft, evidenceDraft, lessonDraft]) => {
      if (isLocalMode && context && questionDraft && sourceDraft && lessonDraft) { setQuestion(questionDraft.centralQuestion); setGrade(context.grade); setAvailableMinutes(Number(context.minutes)); setSelectedIds(sourceDraft.selectedIds); setDraft(lessonDraft); return; }
      const nextQuestion = questionDraft?.centralQuestion || DEFAULT_QUESTION;
      const nextSources = sourceDraft?.selectedIds?.length ? sourceDraft.selectedIds : DEFAULT_SOURCE_IDS;
      const nextRelations = evidenceDraft?.relations || createEvidenceMapDraft(nextQuestion, nextSources, questionDraft?.subQuestions).relations;
      setQuestion(nextQuestion); setGrade(context?.grade || syntheticFixture.grade); setAvailableMinutes(Number(context?.minutes || syntheticFixture.minutes)); setSelectedIds(nextSources);
      setDraft(lessonDraft ? normalizeLessonDesignDraft(lessonDraft, nextQuestion, nextSources, nextRelations) : createLessonDesignDraft(nextQuestion, nextSources, nextRelations));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);
  useEffect(() => {
    if (isLocalMode || loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveLessonDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, storageKey]);
  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const change = (id: string, value: Partial<Omit<LessonActivity, "id">>) => setDraft((current) => updateLessonActivity(current, id, value));
  const remove = (activity: LessonActivity, index: number) => { setDraft((current) => ({ ...current, activities: current.activities.filter((item) => item.id !== activity.id), confirmed: false })); setRemoved({ activity, index }); };
  const newActivity = (): LessonActivity => ({ id: crypto.randomUUID(), title: "新的课堂活动", minutes: 5, transitionMinutes: 0, sourceIds: selectedIds.slice(0, 1), studentAction: "提取并标注史料信息", evidenceProduct: "一项可观察的证据成果。", difficulty: "学生可能停留在复述材料。", scaffold: "追问：这条材料怎样支持当前问题？", teacherEdited: true, status: "ready" });
  const addActivity = (position: "start" | "end") => setDraft((current) => ({ ...current, confirmed: false, activities: position === "start" ? [newActivity(), ...current.activities] : [...current.activities, newActivity()] }));
  const onDragStart = ({ active }: DragStartEvent) => setActiveTitle(draft.activities.find((item) => item.id === active.id)?.title || "课堂活动");
  const onDragEnd = ({ active, over }: DragEndEvent) => { setActiveTitle(""); if (!over || active.id === over.id) return; setDraft((current) => { const from = current.activities.findIndex((item) => item.id === active.id); const to = current.activities.findIndex((item) => item.id === over.id); return from < 0 || to < 0 ? current : { ...current, confirmed: false, activities: arrayMove(current.activities, from, to) }; }); };
  const confirm = () => { if (!summary.ready) return; const next = { ...draft, confirmed: true }; setDraft(next); void (isLocalMode ? ai.commit(next, () => saveLessonDraft(storageKey, next)) : saveLessonDraft(storageKey, next)).then(onNext, () => setSaveState("failed")); };
  const longest = [...draft.activities].sort((a, b) => b.minutes - a.minutes)[0];
  let elapsed = 0;

  return <WorkbenchShell currentStep={4} reachedStep={4} currentLabel="设计活动" nextLabel="评价量规" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : step === 3 ? onReturnEvidence() : undefined}>
    <main className="context-main lesson-main" id="main-content">
      <header className="page-heading"><div><p className="eyebrow">把证据关系排成一堂可实施的课</p><h1>设计活动</h1></div><p className={`save-status ${saveState}`}>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <InlineAiStatus ai={ai} />
      <p className="page-intro">系统已形成可直接调整的课堂节奏。拖动左侧把手重排；修改活动时一次完成全部内容。</p>
      <div className="lesson-context-line"><span>{draft.activities.length} 项活动 · {summary.totalMinutes}/{availableMinutes} 分钟 · {grade}</span><button className="ui-button secondary compact" type="button" onClick={onReturnContext}>查看教学情境</button></div>
      <div className="lesson-thread"><span>整课线索</span><strong>{question}</strong></div>
      {summary.overBy ? <div className="time-guidance" role="alert"><strong>当前超出 {summary.overBy} 分钟</strong><p>建议先将“{longest?.title}”缩短 {summary.overBy} 分钟，或删除一项重复活动。</p></div> : null}
      {summary.reviewCount ? <InlineNotice tone="warning">上游内容已有变化，建议浏览相关活动；现有设计仍可继续使用。</InlineNotice> : null}
      {removed ? <InlineNotice actionLabel="撤销" onAction={() => { setDraft((current) => { const activities = [...current.activities]; activities.splice(removed.index, 0, removed.activity); return { ...current, activities }; }); setRemoved(null); }}>已删除“{removed.activity.title}”</InlineNotice> : null}
      <div className="inline-ai-section-heading"><span>整体生成；单项替换保留原课时，可拖动调序</span><InlineAiButton ai={ai} target="all" label="生成整课活动" /></div><button className="add-module" type="button" onClick={() => addActivity("start")}>在开头添加活动</button>
      {loading ? <div className="context-skeleton" aria-busy="true"><span /><span /></div> : <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTitle("")}><SortableContext items={draft.activities.map((activity) => activity.id)} strategy={verticalListSortingStrategy}><section className="activity-stack">{draft.activities.map((activity, index) => { const start = elapsed; elapsed += activity.minutes; return <ActivityCard key={activity.id} activity={activity} index={index} startMinute={start} selectedIds={selectedIds} aiControl={<InlineAiButton ai={ai} target={activity.id} label={`替换活动 ${index + 1}`} />} onChange={(value) => change(activity.id, value)} onDelete={() => remove(activity, index)} />; })}</section></SortableContext><DragOverlay>{activeTitle ? <div className="drag-overlay">{activeTitle}</div> : null}</DragOverlay></DndContext>}
      <button className="add-module" type="button" onClick={() => addActivity("end")}>在末尾添加活动</button>
      <PageActionBar status={`${draft.activities.length} 项活动 · ${summary.totalMinutes}/${availableMinutes} 分钟`} detail={summary.ready ? `${summary.sourceCount} 条史料已进入课堂` : "按上方引导补齐活动内容或调整时间"}><button className="ui-button primary" type="button" disabled={!summary.ready || ai.busy} onClick={confirm}>{isLocalMode ? "确认活动并设计量规" : "设计评价量规"}</button></PageActionBar>
    </main>
  </WorkbenchShell>;
}
