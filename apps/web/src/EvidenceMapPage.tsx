import { useInlineAi, InlineAiButton, InlineAiStatus } from "./InlineAi";
import { isLocalMode } from "./runtime-mode";
import { useTaskSources } from "./LocalTaskBoundary";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { addEvidenceRelation, createEvidenceMapDraft, defaultSubQuestions, getEvidenceMapSummary, moveEvidenceRelation, normalizeEvidenceMapDraft, removeEvidenceRelation, updateEvidenceRelation, type EvidenceMapDraft, type EvidenceRelation, type RelationKind } from "./evidence-map";
import { sourceFixture } from "./source-discovery";
import { loadEvidenceDraft, loadQuestionDraft, loadSourceDraft, saveEvidenceDraft, saveQuestionDraft } from "./teaching-context-store";
import { DragHandle, IconButton, InlineNotice, PageActionBar, SelectControl } from "./UiControls";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const DEFAULT_QUESTION = "唐朝为何由盛转衰？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const relationKinds: RelationKind[] = ["背景条件", "支持原因", "关键转折", "后续影响", "质疑或限制"];

function readScenario() {
  if (typeof window === "undefined" || !import.meta.env.DEV || isLocalMode) return "ready";
  return new URLSearchParams(window.location.search).get("p05-state") || "ready";
}

function RelationCard({ relation, onKind, onReason, onRemove }: { onReason?: (value: string) => void; relation: EvidenceRelation; onKind: (kind: RelationKind) => void; onRemove: () => void }) {
  const source = useTaskSources().find(item => item.id === relation.sourceId);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `relation:${relation.id}`, data: { type: "relation", relationId: relation.id, title: source?.title } });
  return <li ref={setNodeRef} className={`evidence-card ${isDragging ? "is-dragging" : ""}`} style={transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` } : undefined}><div className="evidence-card-heading"><DragHandle label={`拖动${source?.title || "史料"}`} {...attributes} {...listeners} /><strong>{source?.title || "已移出目录的史料"}</strong><IconButton icon="delete" tone="danger" label={`从当前问题移除${source?.title || "史料"}`} onClick={onRemove} /></div><label className="relation-control"><span>与问题的关系</span><SelectControl value={relation.kind} onChange={(event) => onKind(event.target.value as RelationKind)}>{relationKinds.map((kind) => <option key={kind}>{kind}</option>)}</SelectControl></label>{isLocalMode && onReason ? <label className="field"><span>关系理由（可修改）</span><textarea rows={3} value={relation.reason} onChange={event => onReason(event.target.value)} /></label> : <p>{source?.interpretation || relation.reason}</p>}{isLocalMode ? <details className="inline-source-note"><summary>核对原文与来源</summary><p>{source?.excerpt || "正文不可用"}</p><p>定位：{source?.locator}</p><p>限制：{source?.limitation}</p><p>{source?.statusNote}</p>{!relation.citations?.some(citation => citation.quotedText) ? <p>未附原文短引，请确认关系理由；模拟建议不代表证据已成立。</p> : relation.citations.map((citation, index) => citation.quotedText ? <blockquote key={index}>{citation.quotedText}</blockquote> : null)}</details> : null}</li>;
}

function SourceShelfCard({ sourceId, claims, onAdd }: { sourceId: string; claims: EvidenceMapDraft["claims"]; onAdd: (claimId: string) => void }) {
  const source = useTaskSources().find(item => item.id === sourceId);
  const [target, setTarget] = useState(claims[0]?.id || "");
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `source:${sourceId}`, data: { type: "source", sourceId, title: source?.title } });
  return <article ref={setNodeRef} className={isDragging ? "is-dragging" : ""} style={transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` } : undefined}><div className="shelf-source-heading"><DragHandle label={`拖动${source?.title || "史料"}`} {...attributes} {...listeners} /><div><span>{source?.nature}</span><strong>{source?.title || sourceId}</strong></div></div><div className="shelf-place"><SelectControl aria-label={`选择${source?.title || "史料"}要放入的问题`} value={target} onChange={(event) => setTarget(event.target.value)}>{claims.map((claim, index) => <option value={claim.id} key={claim.id}>问题 {index + 1}</option>)}</SelectControl><button className="ui-button quiet" type="button" onClick={() => target && onAdd(target)}>放入</button></div></article>;
}

function QuestionZone({ claim, index, children, aiControl, editing, onEdit, onChange, onGap }: { claim: EvidenceMapDraft["claims"][number]; index: number; children: ReactNode; aiControl?: ReactNode; editing: boolean; onEdit: () => void; onChange: (value: string) => void; onGap: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: claim.id, data: { type: "claim", claimId: claim.id } });
  return <article ref={setNodeRef} className={`question-zone ${isOver ? "is-over" : ""}`}><header><span>{index + 1}</span><div>{editing ? <input value={claim.text} autoFocus onChange={(event) => onChange(event.target.value)} /> : <h2>{claim.text}</h2>}</div><IconButton icon={editing ? "check" : "edit"} label={editing ? `完成修改问题${index + 1}` : `修改问题${index + 1}`} onClick={onEdit} /></header>{aiControl}{children || <div className="zone-empty"><p>{claim.gapAccepted ? "此处暂时保留为证据缺口。" : "将史料拖入这里，或暂时标记证据缺口。"}</p><button className="ui-button quiet" type="button" onClick={onGap}>{claim.gapAccepted ? "取消缺口" : "标记暂时缺口"}</button></div>}</article>;
}

export function EvidenceMapPage({ taskId = "demo-tang-45m", onBack, onReturnContext, onReturnQuestion, onReturnSources, onNext = () => undefined }: { taskId?: string; onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onNext?: () => void }) {
  const sourceById = new Map(useTaskSources().map(source => [source.id, source]));
  const scenario = useMemo(readScenario, []);
  const storageKey = scenario === "ready" ? taskId : `${taskId}:scenario:${scenario}`;
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [subQuestions, setSubQuestions] = useState(defaultSubQuestions);
  const [selectedIds, setSelectedIds] = useState(DEFAULT_SOURCE_IDS);
  const [draft, setDraft] = useState<EvidenceMapDraft>(() => createEvidenceMapDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS));
  const [loading, setLoading] = useState(scenario === "ready");
  const ai = useInlineAi(taskId, "evidenceAnalysis", draft, setDraft, loading);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [removed, setRemoved] = useState<EvidenceRelation | null>(null);
  const [editingClaim, setEditingClaim] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }), useSensor(KeyboardSensor));
  const { setNodeRef: setShelfRef, isOver: shelfOver } = useDroppable({ id: "source-shelf", data: { type: "shelf" } });
  const summary = getEvidenceMapSummary(draft, selectedIds);

  useEffect(() => {
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey)]).then(([questionDraft, sourceDraft, evidenceDraft]) => {
      if (isLocalMode && questionDraft && sourceDraft && evidenceDraft) {
        setQuestion(questionDraft.centralQuestion); setSubQuestions(questionDraft.subQuestions); setSelectedIds(sourceDraft.selectedIds);
        setDraft(evidenceDraft.claims.length ? evidenceDraft : { ...evidenceDraft, claims: (questionDraft.subQuestions.length ? questionDraft.subQuestions : questionDraft.centralQuestion ? [questionDraft.centralQuestion] : []).map((text, index) => ({ id: `QUESTION-${index + 1}`, text, gapAccepted: false })), relations: [] }); return;
      }
      const nextQuestion = questionDraft?.centralQuestion || DEFAULT_QUESTION;
      const nextSubQuestions = questionDraft?.subQuestions?.length ? questionDraft.subQuestions : defaultSubQuestions;
      const nextSources = sourceDraft?.selectedIds?.length ? sourceDraft.selectedIds : DEFAULT_SOURCE_IDS;
      setQuestion(nextQuestion); setSubQuestions(nextSubQuestions); setSelectedIds(nextSources);
      setDraft(evidenceDraft ? normalizeEvidenceMapDraft(evidenceDraft, nextQuestion, nextSources, nextSubQuestions) : createEvidenceMapDraft(nextQuestion, nextSources, nextSubQuestions));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);
  useEffect(() => {
    if (isLocalMode || loading) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveEvidenceDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const addToClaim = (sourceId: string, claimId: string) => {
    const source = sourceById.get(sourceId);
    if (!source) return;
    const questionId = Number(claimId.split("-")[1]);
    const kind: RelationKind = source.role === "反例限制" ? "质疑或限制" : questionId === 1 ? "背景条件" : questionId === 2 ? "关键转折" : "后续影响";
    setDraft((current) => addEvidenceRelation(current, { claimId, sourceId, kind, reason: source.interpretation }).draft);
  };
  const onDragStart = (event: DragStartEvent) => setActiveTitle(String(event.active.data.current?.title || "史料"));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTitle("");
    if (!over) return;
    const type = active.data.current?.type;
    if (type === "source" && over.data.current?.type === "claim") addToClaim(String(active.data.current?.sourceId), String(over.id));
    if (type === "relation" && over.data.current?.type === "claim") setDraft((current) => moveEvidenceRelation(current, String(active.data.current?.relationId), String(over.id)));
    if (type === "relation" && over.id === "source-shelf") {
      const relation = draft.relations.find((item) => item.id === active.data.current?.relationId);
      if (relation) { setDraft((current) => removeEvidenceRelation(current, relation.id)); setRemoved(relation); }
    }
  };
  const changeClaim = (claimId: string, text: string) => {
    setDraft((current) => ({ ...current, confirmed: false, claims: current.claims.map((claim) => claim.id === claimId ? { ...claim, text } : claim) }));
    const index = draft.claims.findIndex((claim) => claim.id === claimId);
    if (index >= 0) {
      const next = subQuestions.map((value, itemIndex) => itemIndex === index ? text : value);
      setSubQuestions(next);
      if (!isLocalMode) void loadQuestionDraft(storageKey).then((stored) => stored && saveQuestionDraft(storageKey, { ...stored, subQuestions: next, confirmed: false }));
    }
  };
  const removeRelation = (relation: EvidenceRelation) => { setDraft((current) => removeEvidenceRelation(current, relation.id)); setRemoved(relation); };
  const confirm = () => {
    if (!summary.ready) return;
    const next = { ...draft, confirmed: true };
    setDraft(next);
    void (isLocalMode ? ai.commit(next, () => saveEvidenceDraft(storageKey, next)) : saveEvidenceDraft(storageKey, next)).then(onNext, () => setSaveState("failed"));
  };

  return <WorkbenchShell currentStep={3} reachedStep={3} currentLabel="组织证据" nextLabel="设计活动" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : undefined}>
    <main className="context-main evidence-main" id="main-content">
      <header className="page-heading"><div><p className="eyebrow">系统先放好，教师自由调整</p><h1>组织证据</h1></div><p className={`save-status ${saveState}`}>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <InlineAiStatus ai={ai} />
      <p className="page-intro">从史料架拖入问题即可建立关系；再次从史料架拖入，可让同一史料服务多个问题。</p>
      <div className="main-question-line"><span>整课线索</span><strong>{question}</strong><IconButton icon="edit" label="返回修改中心问题" onClick={onReturnQuestion} /></div>
      {draft.relations.some((relation) => relation.status === "needs-review") ? <InlineNotice tone="warning">问题或史料已有变化，建议浏览当前关系；不影响继续设计。</InlineNotice> : null}
      {removed ? <InlineNotice actionLabel="撤销" onAction={() => { setDraft((current) => ({ ...current, relations: [...current.relations, removed] })); setRemoved(null); }}>已将史料移回史料架</InlineNotice> : null}
      <div className="inline-ai-section-heading"><span>按问题组织关系，材料由你核对</span><InlineAiButton ai={ai} target="all" label="生成全部证据关系" /></div>
      {loading ? <div className="context-skeleton" aria-busy="true"><span /><span /></div> : <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTitle("")}><div className="evidence-board"><section className="question-zones" aria-label="子问题与证据">{draft.claims.map((claim, index) => { const relations = draft.relations.filter((relation) => relation.claimId === claim.id); return <QuestionZone key={claim.id} claim={claim} index={index} aiControl={<InlineAiButton ai={ai} target={claim.id} label={`生成问题 ${index + 1} 的证据关系`} />} editing={editingClaim === claim.id} onEdit={() => setEditingClaim((value) => value === claim.id ? null : claim.id)} onChange={(text) => changeClaim(claim.id, text)} onGap={() => setDraft((current) => ({ ...current, claims: current.claims.map((item) => item.id === claim.id ? { ...item, gapAccepted: !item.gapAccepted } : item) }))}>{relations.length ? <ul>{relations.map((relation) => <RelationCard key={relation.id} relation={relation} onKind={(kind) => setDraft((current) => updateEvidenceRelation(current, relation.id, { kind, reason: relation.reason }))} onReason={(reason) => setDraft(current => updateEvidenceRelation(current, relation.id, { kind: relation.kind, reason }))} onRemove={() => removeRelation(relation)} />)}</ul> : null}</QuestionZone>; })}</section><aside ref={setShelfRef} className={`source-tray ${shelfOver ? "is-over" : ""}`}><header><div><h2>史料架</h2><p>拖入问题可添加；将问题中的史料拖回这里可移除。</p></div><button className="ui-button secondary compact" type="button" onClick={onReturnSources}>调整史料</button></header><div>{selectedIds.map((id) => <SourceShelfCard key={id} sourceId={id} claims={draft.claims} onAdd={(claimId) => addToClaim(id, claimId)} />)}</div></aside></div><DragOverlay>{activeTitle ? <div className="drag-overlay">{activeTitle}</div> : null}</DragOverlay></DndContext>}
      <PageActionBar status={summary.ready ? `${summary.relationCount} 条证据关系已覆盖全部问题` : "仍有问题缺少证据"} detail={summary.ready ? "可继续设计课堂活动" : "为每个问题加入史料，或明确标记暂时缺口"}><button className="ui-button primary" type="button" disabled={!summary.ready || ai.busy} onClick={confirm}>{isLocalMode ? "确认证据并设计活动" : "设计课堂活动"}</button></PageActionBar>
    </main>
  </WorkbenchShell>;
}
