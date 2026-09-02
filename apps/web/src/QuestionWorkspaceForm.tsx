import { useEffect, useState } from "react";
import { inputTypes, type InputType, type QuestionErrors, type QuestionProposal, type QuestionWorkspaceDraft } from "./question-workspace";

function QuestionFieldError({ field, errors }: { field: keyof QuestionErrors; errors: QuestionErrors }) {
  return errors[field] ? <p className="field-error" id={`question-${field}-error`}>{errors[field]}</p> : null;
}

export function UnderstandingLine({ draft, errors, onTypeChange }: { draft: QuestionWorkspaceDraft; errors: QuestionErrors; onTypeChange: (value: InputType) => void }) {
  return (
    <fieldset className="field-group question-type" aria-describedby={errors.inputType ? "question-inputType-error" : undefined}>
      <legend>我理解你想探究的是</legend>
      <div className="question-type-grid">
        {inputTypes.map((type) => <label className="choice-card" key={type}><input type="radio" name="inputType" value={type} checked={draft.inputType === type} onChange={() => onTypeChange(type)} /><span>{type}</span></label>)}
      </div>
      <small>{draft.typeReason}</small>
      <QuestionFieldError field="inputType" errors={errors} />
    </fieldset>
  );
}

export function ClarifyingChoice({ current, primary, alternative, onChoose }: { current: string; primary: QuestionProposal; alternative: QuestionProposal; onChoose: (proposal: QuestionProposal) => void }) {
  const choices = [
    { proposal: primary, label: "判断边界", note: "研究这个判断能在多大程度上成立。" },
    { proposal: alternative, label: "比较视角", note: "研究不同对象、群体或史料的异同。" },
  ];
  return (
    <fieldset className="field-group question-focus">
      <legend>这节课更侧重</legend>
      <div className="question-focus-grid">
        {choices.map(({ proposal, label, note }) => <label className="choice-card" key={proposal.id}><input type="radio" name="questionFocus" value={proposal.id} checked={current === proposal.id} onChange={() => onChoose(proposal)} /><span><strong>{label}</strong><small>{note}</small></span></label>)}
      </div>
    </fieldset>
  );
}

export function PreferredPlan({ draft, errors, disabled, onChange, onConfirm }: { draft: QuestionWorkspaceDraft; errors: QuestionErrors; disabled: boolean; onChange: (field: "centralQuestion" | "evidenceOutcome", value: string) => void; onConfirm: () => void }) {
  const [editing, setEditing] = useState(false);
  const [questionValue, setQuestionValue] = useState(draft.centralQuestion);
  const [evidenceValue, setEvidenceValue] = useState(draft.evidenceOutcome);

  useEffect(() => {
    if (!errors.centralQuestion && !errors.evidenceOutcome) return;
    setQuestionValue(draft.centralQuestion);
    setEvidenceValue(draft.evidenceOutcome);
    setEditing(true);
  }, [draft.centralQuestion, draft.evidenceOutcome, errors.centralQuestion, errors.evidenceOutcome]);

  const startEditing = () => {
    setQuestionValue(draft.centralQuestion);
    setEvidenceValue(draft.evidenceOutcome);
    setEditing(true);
  };

  const finishEditing = () => {
    onChange("centralQuestion", questionValue);
    if (errors.evidenceOutcome) onChange("evidenceOutcome", evidenceValue);
    setEditing(false);
  };

  return (
    <section className="question-editor" aria-labelledby="question-editor-heading">
      <label className="field field-featured" data-invalid={Boolean(errors.centralQuestion)}>
        <span id="question-editor-heading">中心问题</span>
        {editing ? <textarea name="centralQuestion" maxLength={180} rows={3} value={questionValue} autoFocus aria-invalid={Boolean(errors.centralQuestion)} aria-describedby={errors.centralQuestion ? "question-centralQuestion-error" : undefined} onChange={(event) => setQuestionValue(event.target.value)} /> : <span className="question-value">{draft.centralQuestion}</span>}
        <QuestionFieldError field="centralQuestion" errors={errors} />
      </label>
      {editing && errors.evidenceOutcome ? <label className="field" data-invalid="true"><span>学生如何使用证据</span><textarea name="evidenceOutcome" maxLength={240} rows={3} value={evidenceValue} aria-invalid="true" aria-describedby="question-evidenceOutcome-error" onChange={(event) => setEvidenceValue(event.target.value)} /><QuestionFieldError field="evidenceOutcome" errors={errors} /></label> : null}
      <div className="act-actions question-actions">
        {editing ? <div className="question-edit-actions"><button type="button" onClick={() => setEditing(false)}>取消修改</button><button type="button" onClick={finishEditing}>完成修改</button></div> : <button type="button" onClick={startEditing}>修改中心问题</button>}
        <button className="context-primary" type="button" disabled={disabled || draft.confirmed || editing} onClick={onConfirm}>{draft.confirmed ? "探究问题已确认" : editing ? "先完成修改" : "确认探究问题"}</button>
      </div>
    </section>
  );
}

export function QuestionBrief({ draft, omission }: { draft: QuestionWorkspaceDraft; omission: string }) {
  return (
    <>
      <p className="eyebrow">当前探究问题</p>
      <h2>{draft.centralQuestion}</h2>
      <dl>
        <div><dt>学生如何使用证据</dt><dd>{draft.evidenceOutcome}</dd></div>
        <div><dt>课堂边界</dt><dd>{draft.scopeBoundary}<small>{omission}</small></dd></div>
      </dl>
      <p className="question-next">{draft.confirmed ? "这一版已由教师确认" : "确认后进入查找史料"}</p>
    </>
  );
}
