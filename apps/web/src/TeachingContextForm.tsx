import {
  gradeOptions,
  lessonTypeOptions,
  type FieldErrors,
  type TeachingContextDraft,
} from "./teaching-context";

type TeachingContextFormProps = {
  draft: TeachingContextDraft;
  errors: FieldErrors;
  disabled: boolean;
  actionLabel: string;
  onChange: <Key extends keyof TeachingContextDraft>(key: Key, value: TeachingContextDraft[Key]) => void;
  onToggle: (key: "lessonTypes", value: string) => void;
  onSubmit: () => void;
};

function FieldError({ field, errors }: { field: keyof TeachingContextDraft; errors: FieldErrors }) {
  return errors[field] ? <p className="field-error" id={`${field}-error`}>{errors[field]}</p> : null;
}

function describedBy(field: keyof TeachingContextDraft, errors: FieldErrors, hint?: string) {
  return [hint, errors[field] ? `${field}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function TeachingContextForm({ draft, errors, disabled, actionLabel, onChange, onToggle, onSubmit }: TeachingContextFormProps) {
  return (
    <form className="context-form" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <section className="form-section" aria-labelledby="class-heading">
        <div className="section-heading">
          <span aria-hidden="true">壹</span>
          <div><h2 id="class-heading">先确定这节课的边界</h2><p>只填写会影响下一步探究问题的课程信息，其余条件稍后按需补充。</p></div>
        </div>

        <div className="field-grid">
          <label className="field" data-invalid={Boolean(errors.textbook)}>
            <span>教材版本 <b aria-hidden="true">*</b></span>
            <input name="textbook" value={draft.textbook} aria-invalid={Boolean(errors.textbook)} aria-describedby={describedBy("textbook", errors, "textbook-hint")} onChange={(event) => onChange("textbook", event.target.value)} />
            <small id="textbook-hint">例如：统编版《中外历史纲要（上）》</small>
            <FieldError field="textbook" errors={errors} />
          </label>
          <label className="field" data-invalid={Boolean(errors.lesson)}>
            <span>单元 / 课次 <b aria-hidden="true">*</b></span>
            <input name="lesson" maxLength={120} value={draft.lesson} aria-invalid={Boolean(errors.lesson)} aria-describedby={describedBy("lesson", errors, "lesson-hint")} onChange={(event) => onChange("lesson", event.target.value)} />
            <small id="lesson-hint">{draft.lesson.length}/120 字</small>
            <FieldError field="lesson" errors={errors} />
          </label>
        </div>

        <div className="field-grid field-grid-compact">
          <fieldset className="field-group" data-invalid={Boolean(errors.stage)} aria-invalid={Boolean(errors.stage)}>
            <legend>学段 <span aria-hidden="true">*</span></legend>
            <div className="choice-row">
              {(["初中", "高中"] as const).map((stage) => (
                <label className="choice-card" key={stage}>
                  <input type="radio" name="stage" value={stage} checked={draft.stage === stage} aria-describedby={describedBy("stage", errors)} onChange={() => onChange("stage", stage)} />
                  <span>{stage}</span>
                </label>
              ))}
            </div>
            <FieldError field="stage" errors={errors} />
          </fieldset>
          <label className="field" data-invalid={Boolean(errors.grade)}>
            <span>年级 <b aria-hidden="true">*</b></span>
            <select name="grade" value={draft.grade} aria-invalid={Boolean(errors.grade)} aria-describedby={describedBy("grade", errors)} onChange={(event) => onChange("grade", event.target.value)}>
              <option value="">请选择</option>
              {(draft.stage ? gradeOptions[draft.stage] : []).map((grade) => <option key={grade}>{grade}</option>)}
            </select>
            <FieldError field="grade" errors={errors} />
          </label>
        </div>

        <div className="field-grid">
          <label className="field" data-invalid={Boolean(errors.minutes)}>
            <span>可用时间 <b aria-hidden="true">*</b></span>
            <span className="input-suffix">
              <input name="minutes" type="number" inputMode="numeric" min="1" max="180" step="1" value={draft.minutes} aria-invalid={Boolean(errors.minutes)} aria-describedby={describedBy("minutes", errors, "minutes-hint")} onChange={(event) => onChange("minutes", event.target.value)} />
              <span>分钟</span>
            </span>
            <small id="minutes-hint">1—180 分钟</small>
            <FieldError field="minutes" errors={errors} />
          </label>
          <fieldset className="field-group" data-invalid={Boolean(errors.lessonTypes)}>
            <legend>课型 <em>选填</em></legend>
            <div className="check-grid compact-options">
              {lessonTypeOptions.map((type) => (
                <label className="check-option" key={type}>
                  <input type="checkbox" name="lessonTypes" checked={draft.lessonTypes.includes(type)} aria-describedby={errors.lessonTypes ? "lessonTypes-error" : undefined} onChange={() => onToggle("lessonTypes", type)} />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="field field-featured">
          <span>初步想探究什么 <em>选填</em></span>
          <textarea name="inquiryQuestion" rows={2} maxLength={160} value={draft.inquiryQuestion} aria-invalid={Boolean(errors.inquiryQuestion)} aria-describedby={describedBy("inquiryQuestion", errors, "inquiryQuestion-hint")} onChange={(event) => onChange("inquiryQuestion", event.target.value)} />
          <small id="inquiryQuestion-hint">可以只写一个粗略方向，下一步会把它收束成可由史料回答的问题。</small>
          <FieldError field="inquiryQuestion" errors={errors} />
        </label>

        <aside className="deferred-fields" aria-label="稍后补充的信息">
          <strong>暂时不用填写</strong>
          <p>史料用途与数量会在查找前确认；阅读水平、前置知识和学生困难会在设计活动与支架时补充。</p>
        </aside>

        <div className="act-actions end">
          <button className="context-primary" type="submit" disabled={disabled}>
            {disabled ? "正在确认…" : actionLabel}
          </button>
        </div>
      </section>
    </form>
  );
}
