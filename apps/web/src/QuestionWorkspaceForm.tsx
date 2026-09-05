import { useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { inputTypes, type InputType, type QuestionErrors, type QuestionProposal, type QuestionWorkspaceDraft } from "./question-workspace";
import { DragHandle, IconButton, PageActionBar, SelectControl } from "./UiControls";

function ErrorText({ field, errors }: { field: keyof QuestionErrors; errors: QuestionErrors }) {
  return errors[field] ? <p className="field-error">{errors[field]}</p> : null;
}

export function UnderstandingLine({ draft, onTypeChange }: { draft: QuestionWorkspaceDraft; errors: QuestionErrors; onTypeChange: (value: InputType) => void }) {
  return <label className="inference-line"><span>问题类型</span><SelectControl value={draft.inputType} onChange={(event) => onTypeChange(event.target.value as InputType)}>{inputTypes.map((type) => <option key={type}>{type}</option>)}</SelectControl><small>{draft.typeReason}</small></label>;
}

export function ClarifyingChoice({ current, primary, alternative, onChoose }: { current: string; primary: QuestionProposal; alternative: QuestionProposal; onChoose: (proposal: QuestionProposal) => void }) {
  return <div className="scale-choice" role="group" aria-label="问题规模"><button className={current === "whole-lesson" ? "selected" : ""} type="button" onClick={() => onChoose(primary)}><strong>整课线索</strong><span>拆成2—4个递进问题</span></button><button className={current === "single" ? "selected" : ""} type="button" onClick={() => onChoose(alternative)}><strong>单个问题</strong><span>直接寻找3—5条史料</span></button></div>;
}

function SortableSubQuestion({ id, index, question, onChange, onRemove }: { id: string; index: number; question: string; onChange: (value: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`, transition } : { transition };
  return <li ref={setNodeRef} className={isDragging ? "is-dragging" : ""} style={style}><DragHandle label={`拖动子问题${index + 1}排序`} {...attributes} {...listeners} /><span>{index + 1}</span>{editing ? <input autoFocus value={question} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setEditing(false); }} /> : <p>{question}</p>}<div className="icon-actions"><IconButton icon={editing ? "check" : "edit"} label={editing ? `完成修改子问题${index + 1}` : `修改子问题${index + 1}`} onClick={() => setEditing((value) => !value)} /><IconButton icon="delete" tone="danger" label={`删除子问题${index + 1}`} onClick={onRemove} /></div></li>;
}

export function PreferredPlan({ draft, errors, disabled, aiControl, onChange, onConfirm, onNext }: {
  draft: QuestionWorkspaceDraft; errors: QuestionErrors; disabled: boolean;
  aiControl?: (target: string, label: string) => ReactNode;
  onChange: (field: "centralQuestion" | "evidenceOutcome" | "subQuestions", value: string | string[]) => void;
  onConfirm: () => void; onNext: () => void;
}) {
  const [editingQuestion, setEditingQuestion] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const updateSub = (index: number, value: string) => onChange("subQuestions", draft.subQuestions.map((item, itemIndex) => itemIndex === index ? value : item));
  const itemIds = draft.subQuestions.map((_, index) => `sub-${index}`);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = itemIds.indexOf(String(active.id));
    const to = itemIds.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onChange("subQuestions", arrayMove(draft.subQuestions, from, to));
  };
  return (
    <section className="question-editor">
      <div className="inline-title"><div><span>中心问题</span>{editingQuestion ? <textarea name="centralQuestion" rows={2} value={draft.centralQuestion} onChange={(event) => onChange("centralQuestion", event.target.value)} /> : <h2>{draft.centralQuestion}</h2>}</div><IconButton icon={editingQuestion ? "check" : "edit"} label={editingQuestion ? "完成修改中心问题" : "修改中心问题"} onClick={() => setEditingQuestion((value) => !value)} /></div>
      {aiControl?.("centralQuestion", "生成中心问题")}<ErrorText field="centralQuestion" errors={errors} />
      {draft.focus === "whole-lesson" ? <section className="subquestion-editor"><header><div><span>递进子问题</span><small>拖动左侧把手即可调整课堂推进顺序</small></div><IconButton icon="add" label="添加子问题" onClick={() => onChange("subQuestions", [...draft.subQuestions, "新的子问题？"])} /></header>{aiControl?.("subQuestions", "生成子问题")}<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={itemIds} strategy={verticalListSortingStrategy}><ol>{draft.subQuestions.map((question, index) => <SortableSubQuestion key={itemIds[index]} id={itemIds[index]} index={index} question={question} onChange={(value) => updateSub(index, value)} onRemove={() => onChange("subQuestions", draft.subQuestions.filter((_, itemIndex) => itemIndex !== index))} />)}</ol></SortableContext></DndContext></section> : null}
      <section className="outcome-options" aria-labelledby="outcome-heading"><h3 id="outcome-heading">学生最终交付什么</h3>{aiControl?.("evidenceOutcome", "生成交付要求")}<p className="choice-hint">选一个大致形式，再按课堂需要修改下面的内容。</p><div className="preset-choices" role="group" aria-label="选择最终交付形式">{[
        ["因果链", "小组形成一张因果关系图，标注史料编号，区分背景条件、直接原因与后续影响。"],
        ["比较表", "小组完成一张比较表，引用史料说明异同，并写出一条有证据支持的结论。"],
        ["证据短文", "个人完成一段120—150字的历史解释，引用至少两条史料，并说明结论的限制。"],
        ["时间线", "小组制作一条带史料编号的时间线，标注关键变化与转折，并解释其联系。"],
      ].map(([label, value]) => <button key={label} type="button" aria-pressed={draft.evidenceOutcome === value} onClick={() => onChange("evidenceOutcome", value)}>{label}</button>)}</div><label className="field outcome-field"><span>交付要求（可自由修改）</span><textarea name="evidenceOutcome" rows={3} value={draft.evidenceOutcome} onChange={(event) => onChange("evidenceOutcome", event.target.value)} /><ErrorText field="evidenceOutcome" errors={errors} /></label></section>
      <PageActionBar status={draft.focus === "whole-lesson" ? `${draft.subQuestions.length} 个子问题已形成` : "按单个问题查找史料"} detail="后续仍可返回查看和修改"><button className="ui-button primary" type="button" disabled={disabled || editingQuestion} onClick={draft.confirmed ? onNext : onConfirm}>{aiControl ? "确认问题并查找史料" : "查找相关史料"}</button></PageActionBar>
    </section>
  );
}

export function QuestionBrief({ draft }: { draft: QuestionWorkspaceDraft; omission: string }) {
  return <><p className="eyebrow">课堂线索</p><h2>{draft.centralQuestion}</h2>{draft.subQuestions.length ? <ol>{draft.subQuestions.map((question) => <li key={question}>{question}</li>)}</ol> : null}<p className="question-next">安史之乱是重要转折，但不等于唐朝立即灭亡。</p></>;
}
