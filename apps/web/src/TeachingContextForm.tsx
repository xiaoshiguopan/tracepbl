import { gradeOptions, lessonTypeOptions, type FieldErrors, type TeachingContextDraft } from "./teaching-context";
import { PageActionBar, SelectControl } from "./UiControls";

type Props = {
  draft: TeachingContextDraft; errors: FieldErrors; disabled: boolean; actionLabel: string;
  onChange: <Key extends keyof TeachingContextDraft>(key: Key, value: TeachingContextDraft[Key]) => void;
  onToggle: (key: "lessonTypes" | "learningNeeds", value: string) => void;
  onSubmit: () => void;
};

const learningNeedOptions = ["区分史料内容与历史解释", "区分长期原因、转折因素与直接原因", "从多条史料形成完整解释"];
const priorKnowledgeOptions = [
  "初中已接触隋唐基本史实、贞观之治和开元盛世",
  "知道主要人物与事件，但史料阅读和因果解释仍需支架",
  "基础史实较稳，可以直接进入多材料比较与历史解释",
];

function ErrorText({ field, errors }: { field: keyof TeachingContextDraft; errors: FieldErrors }) {
  return errors[field] ? <p className="field-error" id={`${field}-error`}>{errors[field]}</p> : null;
}

export function TeachingContextForm({ draft, errors, disabled, actionLabel, onChange, onToggle, onSubmit }: Props) {
  const allGrades = [...gradeOptions.初中, ...gradeOptions.高中];
  return (
    <form className="context-form" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <section className="form-section" aria-labelledby="class-heading">
        <div className="section-heading"><div><h2 id="class-heading">先确定这节课</h2><p>只填写会改变探究范围的信息。学段会根据年级自动判断。</p></div></div>
        <div className="field-grid">
          <label className="field" data-invalid={Boolean(errors.textbook)}><span>教材 <b>*</b></span><input name="textbook" value={draft.textbook} onChange={(event) => onChange("textbook", event.target.value)} /><small>例如：统编版《中外历史纲要（上）》</small><ErrorText field="textbook" errors={errors} /></label>
          <label className="field" data-invalid={Boolean(errors.lesson)}><span>课次 <b>*</b></span><input name="lesson" maxLength={120} value={draft.lesson} onChange={(event) => onChange("lesson", event.target.value)} /><small>例如：第6课《从隋唐盛世到五代十国》</small><ErrorText field="lesson" errors={errors} /></label>
          <label className="field" data-invalid={Boolean(errors.grade)}><span>年级 <b>*</b></span><SelectControl name="grade" value={draft.grade} onChange={(event) => { const grade = event.target.value; onChange("grade", grade); onChange("stage", grade.startsWith("高") ? "高中" : grade ? "初中" : ""); }}><option value="">请选择</option>{allGrades.map((grade) => <option key={grade}>{grade}</option>)}</SelectControl><ErrorText field="grade" errors={errors} /></label>
          <label className="field" data-invalid={Boolean(errors.minutes)}><span>可用时间 <b>*</b></span><span className="input-suffix"><input name="minutes" type="number" min="1" max="180" value={draft.minutes} onChange={(event) => onChange("minutes", event.target.value)} /><span>分钟</span></span><ErrorText field="minutes" errors={errors} /></label>
        </div>
        <details className="advanced-fields"><summary>补充课型（选填）</summary><div className="check-grid">{lessonTypeOptions.map((type) => <label className="check-option" key={type}><input type="checkbox" checked={draft.lessonTypes.includes(type)} onChange={() => onToggle("lessonTypes", type)} /><span>{type}</span></label>)}</div></details>
        <label className="field field-featured"><span>粗略方向 <em>选填</em></span><textarea name="inquiryQuestion" rows={2} maxLength={160} value={draft.inquiryQuestion} onChange={(event) => onChange("inquiryQuestion", event.target.value)} /><small>不用先写成完整问题，下一步会判断它适合作为整课线索还是单个小问题。</small><ErrorText field="inquiryQuestion" errors={errors} /></label>
      </section>

      <section className="form-section learning-profile" aria-labelledby="profile-heading">
        <div className="section-heading"><div><h2 id="profile-heading">学生目前可能需要什么帮助</h2><p>系统已按高一新授课填入常见学情，只调整与本班不符之处。</p></div><span className="reuse-note">匿名学情 · 可复用</span></div>
        <label className="field"><span>已有基础</span><SelectControl value={draft.priorKnowledge} onChange={(event) => onChange("priorKnowledge", event.target.value)}>{priorKnowledgeOptions.map((option) => <option key={option}>{option}</option>)}</SelectControl></label>
        <fieldset className="field-group"><legend>本课优先关注 <em>建议保留 1—2 项</em></legend><div className="learning-chips">{learningNeedOptions.map((need) => <label key={need}><input type="checkbox" checked={draft.learningNeeds.includes(need)} onChange={() => onToggle("learningNeeds", need)} /><span>{need}</span></label>)}</div></fieldset>
        <details className="profile-note"><summary>补充一条匿名说明（选填）</summary><label className="field"><span>只写会影响教学设计的情况</span><textarea maxLength={240} rows={2} value={draft.profileNote} onChange={(event) => onChange("profileNote", event.target.value)} /><ErrorText field="profileNote" errors={errors} /></label></details>
      </section>

      <PageActionBar status="教学情境已在本机保存" detail="后续页面会直接沿用，不必重复填写"><button className="ui-button primary" type="submit" disabled={disabled}>{disabled ? "正在保存…" : actionLabel}</button></PageActionBar>
    </form>
  );
}
