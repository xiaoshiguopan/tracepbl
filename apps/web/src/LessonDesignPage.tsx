import { useEffect, useMemo, useState } from "react";
import { createEvidenceMapDraft, type EvidenceRelation } from "./evidence-map";
import {
  createActivityAlternative,
  createLessonDesignDraft,
  getLessonDesignSummary,
  moveLessonActivity,
  normalizeLessonDesignDraft,
  updateLessonActivity,
  type ActivityErrors,
  type LessonActivity,
  type LessonDesignDraft,
} from "./lesson-design";
import { sourceFixture } from "./source-discovery";
import { syntheticFixture } from "./teaching-context";
import { loadContextDraft, loadEvidenceDraft, loadLessonDraft, loadQuestionDraft, loadSourceDraft, saveLessonDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const TASK_REF = "demo-tang-45m";
const DEFAULT_QUESTION = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const sourceById = new Map(sourceFixture.map((source) => [source.id, source]));
const difficultyOptions = [
  "区分材料信息、观点与历史解释",
  "比较不同类型证据，避免只把材料并列罗列",
  "把比较结果写成有依据、有限度的历史判断",
];

type Scenario = "ready" | "loading" | "empty" | "validation" | "failure" | "timeout" | "offline" | "unavailable" | "overtime" | "empty-sources";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  const value = new URLSearchParams(window.location.search).get("p06-state");
  return (["loading", "empty", "validation", "failure", "timeout", "offline", "unavailable", "overtime", "empty-sources"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function ActivityMovement({ activity, index, isLast, startMinute, selectedIds, errors, showErrors, proposalOpen, onChange, onMove, onRemove, onPropose, onApplyProposal, onDismissProposal }: {
  activity: LessonActivity;
  index: number;
  isLast: boolean;
  startMinute: number;
  selectedIds: string[];
  errors: ActivityErrors;
  showErrors: boolean;
  proposalOpen: boolean;
  onChange: (change: Partial<Omit<LessonActivity, "id">>) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onPropose: () => void;
  onApplyProposal: () => void;
  onDismissProposal: () => void;
}) {
  const endMinute = startMinute + activity.minutes + activity.transitionMinutes;
  const proposal = createActivityAlternative(activity);
  const invalid = showErrors && Object.keys(errors).length > 0;
  return (
    <article className="lesson-movement" data-activity-invalid={invalid || undefined} data-review={activity.status === "needs-review" || undefined} tabIndex={invalid ? -1 : undefined}>
      <div className="movement-time" aria-label={`第 ${startMinute} 到 ${endMinute} 分钟`}>
        <strong>{startMinute}</strong><span aria-hidden="true" /><strong>{endMinute}</strong><small>分钟</small>
      </div>
      <div className="movement-body">
        <header className="movement-heading">
          <div><p>活动{["一", "二", "三", "四", "五"][index] || index + 1}{activity.teacherEdited ? <span>教师已调整</span> : null}</p><h3>{activity.title}</h3><small>{activity.minutes} 分钟任务 · 含 {activity.transitionMinutes} 分钟转换</small></div>
          <div className="movement-order" aria-label="调整活动顺序"><button type="button" disabled={index === 0} onClick={() => onMove(-1)}>上移</button><button type="button" disabled={isLast} onClick={() => onMove(1)}>下移</button></div>
        </header>
        {activity.status === "needs-review" ? <div className="activity-review" role="status">上游问题或史料关系已变化，请检查这一段后重新确认。</div> : null}
        <div className="evidence-chain">
          <section><span>学生动作</span><p>{activity.studentAction}</p></section>
          <span aria-hidden="true">→</span>
          <section><span>使用史料</span><ul>{activity.sourceIds.map((id) => <li key={id}>{sourceById.get(id)?.title || "已移出的史料"}</li>)}</ul></section>
          <span aria-hidden="true">→</span>
          <section><span>留下成果</span><p>{activity.evidenceProduct}</p></section>
        </div>
        {invalid ? <div className="activity-errors" role="alert">{Object.values(errors).map((message) => <p key={message}>{message}</p>)}</div> : null}
        <details className="activity-editor">
          <summary>调整这一段</summary>
          <div className="activity-editor-grid">
            <label><span>活动名称</span><input value={activity.title} onChange={(event) => onChange({ title: event.target.value })} /></label>
            <div className="minute-fields"><label><span>任务分钟</span><input type="number" min="1" max="60" value={activity.minutes} onChange={(event) => onChange({ minutes: Number(event.target.value) })} /></label><label><span>转换分钟</span><input type="number" min="0" max="15" value={activity.transitionMinutes} onChange={(event) => onChange({ transitionMinutes: Number(event.target.value) })} /></label></div>
            <fieldset><legend>绑定史料</legend>{selectedIds.map((id) => <label className="source-check" key={id}><input type="checkbox" checked={activity.sourceIds.includes(id)} onChange={() => onChange({ sourceIds: activity.sourceIds.includes(id) ? activity.sourceIds.filter((sourceId) => sourceId !== id) : [...activity.sourceIds, id] })} /><span>{sourceById.get(id)?.title || id}</span></label>)}</fieldset>
            <label><span>学生动作</span><textarea rows={3} value={activity.studentAction} onChange={(event) => onChange({ studentAction: event.target.value })} /></label>
            <label><span>可观察成果</span><textarea rows={3} value={activity.evidenceProduct} onChange={(event) => onChange({ evidenceProduct: event.target.value })} /></label>
            <label><span>学生最可能卡住的地方</span><select value={activity.difficulty} onChange={(event) => onChange({ difficulty: event.target.value })}>{difficultyOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label><span>对应支架</span><textarea rows={3} value={activity.scaffold} onChange={(event) => onChange({ scaffold: event.target.value })} /></label>
          </div>
          <div className="activity-editor-actions"><button type="button" onClick={onPropose}>只生成本段替代建议</button><button type="button" onClick={onRemove}>移除这一段</button></div>
        </details>
        {proposalOpen ? <section className="activity-diff" aria-label="替代建议差异"><p className="eyebrow">合成替代建议 · 应用前预览</p><div><span>当前</span><del>{activity.studentAction}</del><span>建议</span><ins>{proposal.studentAction}</ins></div><p>{proposal.scaffold}</p><footer><button type="button" onClick={onDismissProposal}>保留当前内容</button><button type="button" onClick={onApplyProposal}>应用这项建议</button></footer></section> : null}
      </div>
    </article>
  );
}

export function LessonDesignPage({ onBack, onReturnContext, onReturnQuestion, onReturnSources, onReturnEvidence }: { onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void; onReturnEvidence: () => void }) {
  const scenario = useMemo(readScenario, []);
  const defaultSourceIds = scenario === "empty-sources" ? [] : DEFAULT_SOURCE_IDS;
  const defaultEvidence = createEvidenceMapDraft(DEFAULT_QUESTION, defaultSourceIds);
  const defaultDraft = createLessonDesignDraft(DEFAULT_QUESTION, defaultSourceIds, defaultEvidence.relations);
  const scenarioDraft = scenario === "empty" ? { ...defaultDraft, activities: [] } : scenario === "validation" ? updateLessonActivity(defaultDraft, "ACT-002", { evidenceProduct: "" }) : scenario === "overtime" ? updateLessonActivity(defaultDraft, "ACT-001", { minutes: 20 }) : defaultDraft;
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [availableMinutes, setAvailableMinutes] = useState(45);
  const [selectedIds, setSelectedIds] = useState(defaultSourceIds);
  const [relations, setRelations] = useState<EvidenceRelation[]>(defaultEvidence.relations);
  const [draft, setDraft] = useState<LessonDesignDraft>(scenarioDraft);
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState("");
  const [showErrors, setShowErrors] = useState(scenario === "validation" || scenario === "overtime");
  const [proposalActivityId, setProposalActivityId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ activity: LessonActivity; index: number } | null>(null);
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;
  const summary = getLessonDesignSummary(draft, availableMinutes);

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadContextDraft(storageKey), loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey), loadLessonDraft(storageKey)]).then(([context, questionDraft, sourceDraft, evidenceDraft, lessonDraft]) => {
      const nextQuestion = questionDraft?.centralQuestion || DEFAULT_QUESTION;
      const nextSources = sourceDraft?.selectedIds || DEFAULT_SOURCE_IDS;
      const nextRelations = evidenceDraft?.relations || createEvidenceMapDraft(nextQuestion, nextSources).relations;
      setQuestion(nextQuestion);
      setAvailableMinutes(Number(context?.minutes || syntheticFixture.minutes));
      setSelectedIds(nextSources);
      setRelations(nextRelations);
      setDraft(lessonDraft ? normalizeLessonDesignDraft(lessonDraft, nextQuestion, nextSources, nextRelations) : createLessonDesignDraft(nextQuestion, nextSources, nextRelations));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (loading || scenario === "unavailable" || selectedIds.length === 0) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveLessonDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, scenario, selectedIds.length, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const changeActivity = (id: string, change: Partial<Omit<LessonActivity, "id">>) => { setDraft((current) => updateLessonActivity(current, id, change)); setFeedback(""); };
  const removeActivity = (activity: LessonActivity, index: number) => { setDraft((current) => ({ ...current, confirmed: false, activities: current.activities.filter((item) => item.id !== activity.id) })); setRemoved({ activity, index }); setFeedback("这一段已移除，可撤销。"); };
  const undoRemove = () => {
    if (!removed) return;
    setDraft((current) => { const activities = [...current.activities]; activities.splice(removed.index, 0, removed.activity); return { ...current, confirmed: false, activities }; });
    setRemoved(null); setFeedback("已恢复刚才移除的活动。");
  };
  const applyProposal = (activity: LessonActivity) => { const proposal = createActivityAlternative(activity); changeActivity(activity.id, proposal); setProposalActivityId(null); setFeedback("替代建议已应用到这一段，其他活动没有改变。"); };
  const rebuild = () => { setDraft(createLessonDesignDraft(question, selectedIds, relations)); setFeedback("已根据当前问题和证据关系排出三段课堂流程。"); };
  const confirm = () => {
    setShowErrors(true);
    if (!summary.ready) {
      setFeedback(summary.overBy ? `当前超出 ${summary.overBy} 分钟，请先调整时长。` : "还有活动信息需要处理，已定位到第一处问题。");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-activity-invalid], .time-ledger[data-over]")?.focus());
      return;
    }
    setDraft((current) => ({ ...current, confirmed: true }));
    setFeedback("课堂流程已确认。本阶段演示开放至设计活动，评价与检查尚未实现。");
  };

  let elapsed = 0;
  return (
    <WorkbenchShell currentStep={4} reachedStep={4} currentLabel="设计活动" nextLabel="评价与检查" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : step === 3 ? onReturnEvidence() : undefined}>
      <main className="context-main lesson-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">把证据关系排成一堂可实施的课</p><h1>设计活动</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">系统已排出一版 {availableMinutes} 分钟课堂流程。你只需检查节奏、难度和支架。</p>
        <div className="lesson-context-line"><span>{syntheticFixture.grade} · {availableMinutes} 分钟 · 盛唐主题</span><button type="button" onClick={onReturnContext}>查看详情</button></div>
        <section className="lesson-question" aria-label="当前中心问题"><p>{question}</p><button type="button" onClick={onReturnQuestion}>查看问题</button></section>
        <details className="fixture-note"><summary>预生成合成活动建议 · 可逐段修改</summary><p>活动、困难和支架是合成演示建议，不是实时 AI 结果；绑定史料仍来自 P03 登记的官方公开来源。</p></details>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可编辑并保存本机草稿；不会假装已调用在线建议。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "替代建议已等待 30 秒" : "暂时无法生成新的活动建议"}</strong><p>现有课堂排演稿和教师编辑全部保留，可以继续手工调整。</p><small>追踪编号：DEMO-P06-001</small></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>当前编辑仍保留在此页，关闭后可能无法恢复。</span></div> : null}
        {feedback ? <div className="selection-feedback lesson-feedback" role="status">{feedback}{removed ? <button type="button" onClick={undoRemove}>撤销</button> : null}</div> : null}

        {loading ? <div className="lesson-skeleton" aria-busy="true" aria-label="正在整理课堂流程"><span /><span /></div> : selectedIds.length === 0 ? (
          <section className="source-empty"><p className="eyebrow">还没有本课史料组</p><h2>先选择并组织证据，再设计活动</h2><p>系统不会生成脱离史料也能完成的课堂任务。</p><button className="context-primary" type="button" onClick={onReturnSources}>返回查找史料</button></section>
        ) : draft.activities.length === 0 ? (
          <section className="lesson-empty"><p className="eyebrow">课堂排演稿为空</p><h2>从已确认的证据关系开始</h2><p>系统会建立三段可编辑流程，不会写入历史结论或覆盖上游内容。</p><button className="context-primary" type="button" onClick={rebuild}>排出三段课堂流程</button></section>
        ) : (
          <div className="lesson-workspace">
            <section className="lesson-score" aria-labelledby="lesson-score-heading">
              <header><div><p className="eyebrow">连续计入任务与转换时间</p><h2 id="lesson-score-heading">课堂排演稿</h2></div><span>{draft.confirmed ? "已确认" : "待确认"}</span></header>
              <div className="score-key" aria-hidden="true"><span>学生动作</span><span>使用史料</span><span>留下成果</span></div>
              {draft.activities.map((activity, index) => {
                const startMinute = elapsed;
                elapsed += activity.minutes + activity.transitionMinutes;
                return <ActivityMovement key={activity.id} activity={activity} index={index} isLast={index === draft.activities.length - 1} startMinute={startMinute} selectedIds={selectedIds} errors={summary.errors[activity.id]} showErrors={showErrors} proposalOpen={proposalActivityId === activity.id} onChange={(change) => changeActivity(activity.id, change)} onMove={(offset) => { setDraft((current) => moveLessonActivity(current, activity.id, offset)); setFeedback("活动顺序已调整。"); }} onRemove={() => removeActivity(activity, index)} onPropose={() => setProposalActivityId(activity.id)} onDismissProposal={() => setProposalActivityId(null)} onApplyProposal={() => applyProposal(activity)} />;
              })}
            </section>

            <aside className="time-ledger" data-over={summary.overBy > 0 || undefined} tabIndex={summary.overBy > 0 ? -1 : undefined} aria-labelledby="time-ledger-heading">
              <header><p className="eyebrow">本课可用 {availableMinutes} 分钟</p><h2 id="time-ledger-heading">课堂时间账簿</h2></header>
              <p className="time-total"><strong>{summary.totalMinutes}</strong><span>/ {availableMinutes} 分钟</span></p>
              <dl><div><dt>任务</dt><dd>{summary.taskMinutes} 分钟</dd></div><div><dt>转换</dt><dd>{summary.transitionMinutes} 分钟</dd></div><div><dt>史料</dt><dd>{summary.sourceCount} 条</dd></div></dl>
              {summary.overBy ? <div className="time-warning" role="alert">超出 {summary.overBy} 分钟。请缩短任务或转换时间，不能把转换时间隐藏起来。</div> : summary.remaining ? <div className="time-remaining">尚余 {summary.remaining} 分钟，可保留机动或补充收束。</div> : <div className="time-balanced">时间已完整排入课堂。</div>}
              <section className="difficulty-note"><strong>当前难点</strong><p>区分材料信息、观点与解释</p><small>不记录学生姓名、班级号或个人画像。</small></section>
              <button className="context-primary lesson-next" type="button" onClick={confirm}>{summary.overBy ? `先调整 ${summary.overBy} 分钟` : "确认课堂流程"}</button>
              <p className="next-step-note">下一步：评价与检查（尚未实现）</p>
            </aside>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
