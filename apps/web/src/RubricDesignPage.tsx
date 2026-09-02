import { useEffect, useMemo, useState } from "react";
import { createEvidenceMapDraft } from "./evidence-map";
import { createLessonDesignDraft, type LessonActivity } from "./lesson-design";
import {
  createRubricAlternative,
  createRubricDraft,
  getRubricSummary,
  normalizeRubricDraft,
  updateRubricDimension,
  updateRubricLevel,
  type RubricDimension,
  type RubricDraft,
} from "./rubric-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadContextDraft, loadLessonDraft, loadQuestionDraft, loadRubricDraft, saveRubricDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const TASK_REF = "demo-tang-45m";
const DEFAULT_QUESTION = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const defaultEvidence = createEvidenceMapDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS);
const defaultLesson = createLessonDesignDraft(DEFAULT_QUESTION, DEFAULT_SOURCE_IDS, defaultEvidence.relations);

type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "timeout" | "offline" | "unavailable" | "missing-activities" | "success";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  const value = new URLSearchParams(window.location.search).get("p07-state");
  return (["loading", "empty", "validation", "failure", "timeout", "offline", "unavailable", "missing-activities", "success"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function RubricBand({ dimension, index, activities, errors, showErrors, proposalOpen, onChange, onLevelChange, onRemove, onPropose, onApplyProposal, onDismissProposal }: {
  dimension: RubricDimension;
  index: number;
  activities: LessonActivity[];
  errors: string[];
  showErrors: boolean;
  proposalOpen: boolean;
  onChange: (change: Partial<Omit<RubricDimension, "id">>) => void;
  onLevelChange: (levelIndex: number, value: string) => void;
  onRemove: () => void;
  onPropose: () => void;
  onApplyProposal: () => void;
  onDismissProposal: () => void;
}) {
  const invalid = showErrors && errors.length > 0;
  const activityLabels = dimension.activityIds.map((id) => activities.find((activity) => activity.id === id)?.title).filter(Boolean);
  const proposal = createRubricAlternative(dimension);
  return (
    <article className="rubric-band" data-invalid={invalid || undefined} data-review={dimension.status === "needs-review" || undefined} tabIndex={invalid ? -1 : undefined}>
      <header>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div><h3>{dimension.title}</h3><p>{dimension.mappingLabel} · {activityLabels.join("、")}</p></div>
      </header>
      <div className="rubric-levels">
        {dimension.levels.map((level) => <section key={level.key}><span>{level.label}</span><p>{level.description}</p></section>)}
      </div>
      <details className="rubric-editor">
        <summary>调整这一维</summary>
        <div className="rubric-editor-fields">
          <label><span>维度名称</span><input value={dimension.title} onChange={(event) => onChange({ title: event.target.value })} /></label>
          {dimension.levels.map((level, levelIndex) => <label key={level.key}><span>{level.label}的可观察行为</span><textarea rows={3} value={level.description} onChange={(event) => onLevelChange(levelIndex, event.target.value)} /></label>)}
        </div>
        <div className="rubric-editor-actions"><button type="button" onClick={onPropose}>只重做这一维建议</button><button type="button" onClick={onRemove}>移除这一维</button></div>
      </details>
      {invalid ? <div className="rubric-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
      {proposalOpen ? <section className="rubric-diff" aria-label="本维替代建议差异"><p className="eyebrow">合成替代建议 · 应用前预览</p><div><span>当前</span><del>{dimension.levels[2]?.description}</del><span>建议</span><ins>{proposal[2]?.description}</ins></div><footer><button type="button" onClick={onDismissProposal}>保留当前内容</button><button type="button" onClick={onApplyProposal}>应用这一维建议</button></footer></section> : null}
    </article>
  );
}

export function RubricDesignPage({ onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence, onReturnLesson, onNext = () => undefined }: { onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void; onReturnLesson: () => void; onNext?: () => void }) {
  const scenario = useMemo(readScenario, []);
  const initialActivities = scenario === "missing-activities" ? [] : defaultLesson.activities;
  const initialDraft = createRubricDraft(initialActivities);
  const scenarioDraft = scenario === "empty" ? { ...initialDraft, dimensions: [] } : scenario === "validation" ? updateRubricLevel(initialDraft, initialDraft.dimensions[0].id, 1, "一般") : scenario === "success" ? { ...initialDraft, confirmed: true } : initialDraft;
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [classLine, setClassLine] = useState(`${syntheticFixture.grade} · ${syntheticFixture.minutes} 分钟 · 盛唐主题`);
  const [activities, setActivities] = useState<LessonActivity[]>(initialActivities);
  const [draft, setDraft] = useState<RubricDraft>(scenarioDraft);
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState(scenario === "success" ? "评价量规已确认。" : "");
  const [showErrors, setShowErrors] = useState(scenario === "validation");
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ dimension: RubricDimension; index: number } | null>(null);
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;
  const summary = getRubricSummary(draft, activities);

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadLessonDraft(storageKey), loadRubricDraft(storageKey)]).then(([context, questionDraft, lessonDraft, rubricDraft]) => {
      const nextQuestion = questionDraft?.centralQuestion || DEFAULT_QUESTION;
      const nextActivities = lessonDraft?.activities || defaultLesson.activities;
      setQuestion(nextQuestion);
      setClassLine(`${context?.grade || syntheticFixture.grade} · ${context?.minutes || syntheticFixture.minutes} 分钟 · 盛唐主题`);
      setActivities(nextActivities);
      setDraft(rubricDraft ? normalizeRubricDraft(rubricDraft, nextActivities) : createRubricDraft(nextActivities));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (loading || scenario === "unavailable" || !activities.length || !draft.dimensions.length) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveRubricDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [activities.length, draft, loading, scenario, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const changeDimension = (id: string, change: Partial<Omit<RubricDimension, "id">>) => { setDraft((current) => updateRubricDimension(current, id, change)); setFeedback(""); };
  const removeDimension = (dimension: RubricDimension, index: number) => {
    setDraft((current) => ({ ...current, confirmed: false, dimensions: current.dimensions.filter((item) => item.id !== dimension.id) }));
    setRemoved({ dimension, index }); setFeedback(`已移除“${dimension.title}”。这会改变 MUST-007 四维评价覆盖，可撤销。`);
  };
  const undoRemove = () => {
    if (!removed) return;
    setDraft((current) => { const dimensions = [...current.dimensions]; dimensions.splice(removed.index, 0, removed.dimension); return { ...current, confirmed: false, dimensions }; });
    setRemoved(null); setFeedback("已恢复刚才移除的评价维度。");
  };
  const rebuild = () => { setDraft(createRubricDraft(activities)); setFeedback("已从当前课堂成果恢复四个评价维度。"); };
  const applyProposal = (dimension: RubricDimension) => { changeDimension(dimension.id, { levels: createRubricAlternative(dimension) }); setProposalId(null); setFeedback("替代建议只应用到这一维，其他评价依据没有改变。"); };
  const confirm = () => {
    setShowErrors(true);
    if (!summary.ready) {
      setFeedback(activities.length ? "还有评价依据需要处理，已定位到第一处问题。" : "缺少已确认的课堂活动和成果，请先返回设计活动。");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-invalid], .rubric-upstream-empty")?.focus());
      return;
    }
    const confirmedDraft = { ...draft, confirmed: true };
    setDraft(confirmedDraft); setSaveState("saving");
    void saveRubricDraft(storageKey, confirmedDraft).then(() => { setSaveState("saved"); onNext(); }, () => { setSaveState("failed"); setFeedback("量规已确认，但本机保存失败。当前内容仍保留在本页。"); });
  };

  return (
    <WorkbenchShell currentStep={5} reachedStep={5} currentLabel="评价量规" nextLabel="设计检查" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : step === 3 ? onReturnEvidence() : step === 4 ? onReturnLesson() : undefined}>
      <main className="context-main rubric-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">把学生留下的证据成果变成可观察的评价依据</p><h1>评价量规</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">系统已根据学生在课堂中留下的成果形成评价依据。这里不比较答案是否一致，只判断学生怎样使用、解释和限定证据。</p>
        <div className="rubric-class-line"><span>{classLine}</span><button type="button" onClick={onReturnLesson}>查看课堂流程</button></div>
        <section className="rubric-question" aria-label="当前探究问题"><span>当前探究问题</span><p>{question}</p><button type="button" onClick={onReturnQuestion}>查看问题</button></section>
        <section className="rubric-products" aria-labelledby="rubric-products-heading"><h2 id="rubric-products-heading">本课留下的成果</h2>{activities.map((activity) => <p key={activity.id}>{activity.evidenceProduct}</p>)}</section>
        <details className="fixture-note"><summary>预生成合成评价建议 · 可逐维修改</summary><p>评价措辞是合成演示建议，不是实时 AI 结果，也不处理学生作品、姓名或成绩；只承接本任务的课堂活动和成果。</p></details>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可编辑并保存本机量规；不会假装已调用在线建议。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "替代建议已等待 30 秒" : "暂时无法生成新的评价建议"}</strong><p>现有量规和教师编辑全部保留，可以继续手工调整。</p><small>追踪编号：DEMO-P07-001</small></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>当前编辑仍保留在此页，关闭后可能无法恢复。</span></div> : null}
        {feedback ? <div className="selection-feedback rubric-feedback" role="status">{feedback}{removed ? <button type="button" onClick={undoRemove}>撤销</button> : null}</div> : null}

        {loading ? <div className="rubric-skeleton" aria-busy="true" aria-label="正在整理评价量规"><span /><span /></div> : activities.length === 0 ? (
          <section className="rubric-upstream-empty" tabIndex={-1}><p className="eyebrow">还没有课堂成果</p><h2>先完成活动，再形成评价依据</h2><p>系统不会输出与课堂任务无关的通用量规。</p><button className="context-primary" type="button" onClick={onReturnLesson}>返回设计活动</button></section>
        ) : draft.dimensions.length === 0 ? (
          <section className="rubric-empty"><p className="eyebrow">评价标尺为空</p><h2>从本课三项成果恢复四个维度</h2><p>系统只会使用当前课堂中能够看到的学生证据行为。</p><button className="context-primary" type="button" onClick={rebuild}>恢复四维评价标尺</button></section>
        ) : (
          <div className="rubric-workspace">
            <section className="rubric-paper" aria-labelledby="rubric-paper-heading">
              <header><div><p className="eyebrow">从只摘抄材料到形成历史解释</p><h2 id="rubric-paper-heading">评阅标尺</h2></div><span>{draft.confirmed ? "已确认" : "待确认"}</span></header>
              <div className="rubric-axis" aria-hidden="true"><span>从只摘抄材料</span><div><i /><i /><i /></div><span>形成历史解释</span></div>
              <div className="rubric-axis-labels" aria-hidden="true"><span>起步观察</span><span>证据成形</span><span>历史解释</span></div>
              <div className="rubric-band-list">{draft.dimensions.map((dimension, index) => <RubricBand key={dimension.id} dimension={dimension} index={index} activities={activities} errors={summary.errors[dimension.id]} showErrors={showErrors} proposalOpen={proposalId === dimension.id} onChange={(change) => changeDimension(dimension.id, change)} onLevelChange={(levelIndex, value) => { setDraft((current) => updateRubricLevel(current, dimension.id, levelIndex, value)); setFeedback(""); }} onRemove={() => removeDimension(dimension, index)} onPropose={() => setProposalId(dimension.id)} onApplyProposal={() => applyProposal(dimension)} onDismissProposal={() => setProposalId(null)} />)}</div>
            </section>

            <aside className="rubric-proof" aria-labelledby="rubric-proof-heading">
              <header><p className="eyebrow">活动与评价逐项核对</p><h2 id="rubric-proof-heading">对齐校样</h2></header>
              <dl><div><dt>{summary.dimensionCount}</dt><dd>个评价维度</dd></div><div><dt>{summary.productCount}</dt><dd>项课堂成果</dd></div><div><dt>{summary.alignedDimensions}/{summary.dimensionCount}</dt><dd>已对齐</dd></div><div><dt>0</dt><dd>项课堂未要求能力</dd></div></dl>
              {summary.omittedCoreDimension ? <div className="rubric-impact" role="alert">当前少于默认四维，会降低 MUST-007 的评价覆盖。确认前请判断是否确实不适用于本课。</div> : <p className="rubric-aligned">四维均能追到本课活动与成果。</p>}
              <strong className="no-score">不计算总分</strong><p className="rubric-purpose">仅用于形成性判断与反馈。</p>
              <button className="context-primary rubric-next" type="button" onClick={confirm}>确认评价量规</button>
              <p className="next-step-note">下一步：设计检查</p>
            </aside>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
