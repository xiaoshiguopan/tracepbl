import { useEffect, useMemo, useState } from "react";
import {
  addEvidenceRelation,
  createEvidenceMapDraft,
  getEvidenceMapSummary,
  normalizeEvidenceMapDraft,
  removeEvidenceRelation,
  updateEvidenceRelation,
  type EvidenceClaim,
  type EvidenceMapDraft,
  type EvidenceRelation,
  type RelationKind,
} from "./evidence-map";
import { sourceFixture } from "./source-discovery";
import { loadEvidenceDraft, loadQuestionDraft, loadSourceDraft, saveEvidenceDraft } from "./teaching-context-store";
import { TaskUnavailable, WorkbenchShell } from "./WorkbenchShell";

const TASK_REF = "demo-tang-45m";
const DEFAULT_QUESTION = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const DEFAULT_SOURCE_IDS = sourceFixture.filter((source) => source.recommended).map((source) => source.id);
const sourceById = new Map(sourceFixture.map((source) => [source.id, source]));
const relationKinds: RelationKind[] = ["支持", "质疑", "补充语境", "不能支持"];

type Scenario = "ready" | "loading" | "empty" | "empty-sources" | "failure" | "timeout" | "offline" | "unavailable" | "validation";
type SaveState = "idle" | "saving" | "saved" | "failed";

function readScenario(): Scenario {
  if (typeof window === "undefined" || !import.meta.env.DEV) return "ready";
  const value = new URLSearchParams(window.location.search).get("p05-state");
  return (["loading", "empty", "empty-sources", "failure", "timeout", "offline", "unavailable", "validation"] as const).includes(value as Exclude<Scenario, "ready">) ? value as Scenario : "ready";
}

function RelationRow({ relation, onChange, onRemove }: { relation: EvidenceRelation; onChange: (change: Pick<EvidenceRelation, "kind" | "reason">) => void; onRemove: () => void }) {
  const source = sourceById.get(relation.sourceId);
  return (
    <li className="relation-note" data-kind={relation.kind} data-needs-attention={relation.status === "needs-review" || !relation.reason.trim() || undefined}>
      <span className="relation-tab">{relation.kind}</span>
      <div><strong>{source?.title || "已移出本课的史料"}</strong><p>{relation.reason}</p>{relation.status === "needs-review" ? <small className="review-copy">上游内容已变化，请重新确认这条关系。</small> : null}</div>
      <details className="relation-editor"><summary>调整关系</summary><div><label htmlFor={`${relation.id}-kind`}><span>关系</span></label><select id={`${relation.id}-kind`} value={relation.kind} onChange={(event) => onChange({ kind: event.target.value as RelationKind, reason: relation.reason })}>{relationKinds.map((kind) => <option key={kind}>{kind}</option>)}</select><label htmlFor={`${relation.id}-reason`}><span>简短理由</span></label><textarea id={`${relation.id}-reason`} rows={2} value={relation.reason} onChange={(event) => onChange({ kind: relation.kind, reason: event.target.value })} /><button type="button" onClick={onRemove}>移除关系</button></div></details>
    </li>
  );
}

function ClaimSlip({ claim, relations, onClaimChange, onToggleGap, onRelationChange, onRelationRemove, onClaimRemove }: { claim: EvidenceClaim; relations: EvidenceRelation[]; onClaimChange: (value: string) => void; onToggleGap: () => void; onRelationChange: (relation: EvidenceRelation, change: Pick<EvidenceRelation, "kind" | "reason">) => void; onRelationRemove: (relation: EvidenceRelation) => void; onClaimRemove: () => void }) {
  return (
    <article className="claim-slip" data-gap={claim.gapAccepted || undefined} tabIndex={-1}>
      <header><span>{claim.gapAccepted ? "证据缺口" : "待判断"}</span><div><h3>{claim.text}</h3><details className="claim-editor"><summary>修改命题</summary><label><span>待判断命题</span><textarea rows={2} value={claim.text} onChange={(event) => onClaimChange(event.target.value)} /></label><button type="button" onClick={onClaimRemove}>移除命题</button></details></div></header>
      {relations.length ? <ul>{relations.map((relation) => <RelationRow key={relation.id} relation={relation} onChange={(change) => onRelationChange(relation, change)} onRemove={() => onRelationRemove(relation)} />)}</ul> : <div className="claim-gap"><p>{claim.gapAccepted ? "保留缺口，后续转化为课堂追问。" : "这条命题还没有关联史料。"}</p><button type="button" onClick={onToggleGap}>{claim.gapAccepted ? "取消缺口标记" : "标记为证据缺口"}</button></div>}
    </article>
  );
}

export function EvidenceMapPage({ onBack, onReturnContext, onReturnQuestion, onReturnSources }: { onBack: () => void; onReturnContext: () => void; onReturnQuestion: () => void; onReturnSources: () => void }) {
  const scenario = useMemo(readScenario, []);
  const initialSources = scenario === "empty-sources" ? [] : DEFAULT_SOURCE_IDS;
  const initialDraft = createEvidenceMapDraft(DEFAULT_QUESTION, initialSources);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [selectedIds, setSelectedIds] = useState(initialSources);
  const [draft, setDraft] = useState<EvidenceMapDraft>(() => scenario === "empty" ? { ...initialDraft, claims: [], relations: [] } : scenario === "validation" ? { ...initialDraft, relations: initialDraft.relations.map((relation, index) => index === 0 ? { ...relation, status: "needs-review" } : relation) } : initialDraft);
  const [loading, setLoading] = useState(() => typeof window !== "undefined" && (scenario === "ready" || scenario === "loading"));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [newClaim, setNewClaim] = useState("");
  const [relationInput, setRelationInput] = useState({ claimId: "CLAIM-001", sourceId: initialSources[0] || "", kind: "支持" as RelationKind, reason: "" });
  const [removedRelation, setRemovedRelation] = useState<EvidenceRelation | null>(null);
  const storageKey = scenario === "ready" ? TASK_REF : `${TASK_REF}:scenario:${scenario}`;
  const summary = getEvidenceMapSummary(draft, selectedIds);

  useEffect(() => {
    if (scenario === "loading") { const timer = window.setTimeout(() => setLoading(false), 5000); return () => window.clearTimeout(timer); }
    if (scenario !== "ready") { setLoading(false); return; }
    void Promise.all([loadQuestionDraft(storageKey), loadSourceDraft(storageKey), loadEvidenceDraft(storageKey)]).then(([storedQuestion, storedSources, storedEvidence]) => {
      const nextQuestion = storedQuestion?.centralQuestion || DEFAULT_QUESTION;
      const nextSources = storedSources?.selectedIds || DEFAULT_SOURCE_IDS;
      setQuestion(nextQuestion);
      setSelectedIds(nextSources);
      setRelationInput((current) => ({ ...current, sourceId: nextSources[0] || "" }));
      setDraft(storedEvidence ? normalizeEvidenceMapDraft(storedEvidence, nextQuestion, nextSources) : createEvidenceMapDraft(nextQuestion, nextSources));
    }, () => setSaveState("failed")).finally(() => setLoading(false));
  }, [scenario, storageKey]);

  useEffect(() => {
    if (loading || scenario === "unavailable" || selectedIds.length === 0) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveEvidenceDraft(storageKey, draft).then(() => setSaveState("saved"), () => setSaveState("failed")), 350);
    return () => window.clearTimeout(timer);
  }, [draft, loading, scenario, selectedIds.length, storageKey]);

  if (scenario === "unavailable") return <TaskUnavailable onBack={onBack} />;

  const changeClaim = (claimId: string, text: string) => setDraft((current) => ({ ...current, confirmed: false, claims: current.claims.map((claim) => claim.id === claimId ? { ...claim, text } : claim) }));
  const removeClaim = (claimId: string) => {
    setDraft((current) => ({ ...current, confirmed: false, claims: current.claims.filter((claim) => claim.id !== claimId), relations: current.relations.filter((relation) => relation.claimId !== claimId) }));
    setFeedback("命题及其关系已移除。需要时可重新添加。");
  };
  const removeRelation = (relation: EvidenceRelation) => { setDraft((current) => removeEvidenceRelation(current, relation.id)); setRemovedRelation(relation); setFeedback("关系已移除，可撤销。"); };
  const undoRelation = () => {
    if (!removedRelation) return;
    setDraft((current) => ({ ...current, relations: [...current.relations, removedRelation] }));
    setRemovedRelation(null);
    setFeedback("已恢复刚才移除的关系。");
  };
  const submitClaim = (event: React.FormEvent) => {
    event.preventDefault();
    const text = newClaim.trim();
    if (!text) { setError("请先写下一个待判断命题。"); return; }
    const id = `CLAIM-${String(draft.claims.length + 1).padStart(3, "0")}`;
    setDraft((current) => ({ ...current, confirmed: false, claims: [...current.claims, { id, text, gapAccepted: false }] }));
    setRelationInput((current) => ({ ...current, claimId: id }));
    setNewClaim(""); setError(""); setFeedback("待判断命题已添加。");
  };
  const submitRelation = (event: React.FormEvent) => {
    event.preventDefault();
    if (!relationInput.claimId || !relationInput.sourceId || !relationInput.reason.trim()) { setError("请选择命题和史料，并填写简短理由。"); return; }
    const result = addEvidenceRelation(draft, { ...relationInput, reason: relationInput.reason.trim() });
    if (result.error) { setError(result.error); return; }
    setDraft(result.draft); setRelationInput((current) => ({ ...current, reason: "" })); setError(""); setFeedback("关系已添加。");
  };
  const confirm = () => {
    if (!summary.ready) { setError("请处理未关联命题或重新确认受影响关系；明确保留的证据缺口可以继续。"); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-needs-attention], .claim-slip:not([data-gap])")?.focus()); return; }
    setDraft((current) => ({ ...current, confirmed: true })); setError(""); setFeedback("关系已确认。本阶段演示开放至组织证据，设计活动页尚未实现。");
  };

  return (
    <WorkbenchShell currentStep={3} reachedStep={3} currentLabel="组织证据" nextLabel="设计活动" onBack={onBack} onNavigateStep={(step) => step === 0 ? onReturnContext() : step === 1 ? onReturnQuestion() : step === 2 ? onReturnSources() : undefined}>
      <main className="context-main evidence-main" id="main-content" tabIndex={-1}>
        <header className="page-heading"><div><p className="eyebrow">让每个判断都能追到史料</p><h1>组织证据</h1></div><p className={`save-status ${saveState}`} aria-live="polite">{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到本机" : saveState === "failed" ? "仅保留在本页" : "本机草稿"}</p></header>
        <p className="page-intro">系统先排好一版论证关系，你只需确认、调整或保留证据缺口。</p>
        <section className="inquiry-strip" aria-label="当前探究问题"><span>当前问题</span><p>{question}</p><button type="button" onClick={onReturnQuestion}>查看问题</button></section>
        <details className="fixture-note"><summary>预生成合成建议 · 可逐项修改</summary><p>待判断命题、关系和理由是合成演示建议，不是实时 AI 或历史结论；史料仍来自 P03 所列官方来源。</p></details>

        {scenario === "offline" ? <div className="status-banner warning" role="status"><strong>当前离线</strong><span>仍可编辑本机关系；不会假装已调用在线分析。</span></div> : null}
        {scenario === "failure" || scenario === "timeout" ? <section className="system-failure" role="alert"><strong>{scenario === "timeout" ? "补充关系建议已等待 30 秒" : "暂时无法补充更多关系建议"}</strong><p>现有论证草案和手工编辑仍然保留，可以继续组织。</p><small>追踪编号：DEMO-P05-001</small></section> : null}
        {saveState === "failed" ? <div className="status-banner warning" role="status"><strong>本地保存不可用</strong><span>当前编辑仍保留在此页面，关闭后可能无法恢复。</span></div> : null}
        {error ? <section className="error-summary" role="alert"><strong>这组关系还需要处理</strong><p>{error}</p></section> : null}
        {feedback ? <div className="selection-feedback" role="status">{feedback}{removedRelation ? <button type="button" onClick={undoRelation}>撤销</button> : null}</div> : null}

        {loading ? <div className="evidence-skeleton" aria-busy="true" aria-label="正在整理证据关系"><span /><span /></div> : selectedIds.length === 0 ? (
          <section className="source-empty"><p className="eyebrow">还没有本课史料组</p><h2>先选择史料，再组织证据关系</h2><p>系统不会在没有史料时生成默认历史结论。返回查找史料页，至少选择一组可用材料。</p><button className="context-primary" type="button" onClick={onReturnSources}>返回查找史料</button></section>
        ) : (
          <div className="evidence-workspace">
            <section className="argument-paper" aria-labelledby="argument-heading">
              <header><div><h2 id="argument-heading">论证草案</h2><p>预生成合成建议 · 可逐项修改</p></div><span>{draft.confirmed ? "已确认" : "待确认"}</span></header>
              {draft.claims.length ? <div className="claim-list">{draft.claims.map((claim) => <ClaimSlip key={claim.id} claim={claim} relations={draft.relations.filter((relation) => relation.claimId === claim.id)} onClaimChange={(text) => changeClaim(claim.id, text)} onToggleGap={() => setDraft((current) => ({ ...current, confirmed: false, claims: current.claims.map((item) => item.id === claim.id ? { ...item, gapAccepted: !item.gapAccepted } : item) }))} onRelationChange={(relation, change) => setDraft((current) => updateEvidenceRelation(current, relation.id, change))} onRelationRemove={removeRelation} onClaimRemove={() => removeClaim(claim.id)} />)}</div> : <div className="empty-claims"><h3>还没有待判断命题</h3><p>写一句需要由史料检验的问题，不要先写成确定结论。</p></div>}
              <div className="evidence-additions">
                <details open={scenario === "empty" || undefined}><summary>添加待判断命题</summary><form onSubmit={submitClaim}><label><span>待判断命题</span><textarea rows={2} value={newClaim} onChange={(event) => setNewClaim(event.target.value)} /></label><button type="submit">添加命题</button></form></details>
                <details><summary>补充一条关系</summary><form onSubmit={submitRelation}><label><span>命题</span><select value={relationInput.claimId} onChange={(event) => setRelationInput((current) => ({ ...current, claimId: event.target.value }))}>{draft.claims.map((claim) => <option value={claim.id} key={claim.id}>{claim.text}</option>)}</select></label><label><span>史料</span><select value={relationInput.sourceId} onChange={(event) => setRelationInput((current) => ({ ...current, sourceId: event.target.value }))}>{selectedIds.map((id) => <option value={id} key={id}>{sourceById.get(id)?.title || id}</option>)}</select></label><label><span>关系</span><select value={relationInput.kind} onChange={(event) => setRelationInput((current) => ({ ...current, kind: event.target.value as RelationKind }))}>{relationKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label><label><span>简短理由</span><textarea rows={2} value={relationInput.reason} onChange={(event) => setRelationInput((current) => ({ ...current, reason: event.target.value }))} /></label><button type="submit">添加关系</button></form></details>
              </div>
            </section>

            <aside className="evidence-ledger" aria-labelledby="ledger-heading">
              <header><p className="eyebrow">当前论证覆盖</p><h2 id="ledger-heading">证据账簿</h2></header>
              <dl><div><dt>{summary.claimCount}</dt><dd>个待判断命题</dd></div><div><dt>{summary.relationCount}</dt><dd>条史料关系</dd></div><div><dt>{summary.gapCount}</dt><dd>处证据缺口</dd></div><div><dt>{summary.unconnectedSourceCount}</dt><dd>条未连接史料</dd></div></dl>
              <section className="relation-overview"><h3>关系全貌</h3>{draft.claims.map((claim) => { const relations = draft.relations.filter((relation) => relation.claimId === claim.id); return <div key={claim.id}><strong>{claim.text}</strong><span>{claim.gapAccepted ? "证据缺口" : `${relations.length} 条关系`}</span></div>; })}</section>
              <p className="ledger-note">关系建议只帮助组织，不替代教师的历史判断。</p>
              <button className="context-primary evidence-next" type="button" onClick={confirm}>确认这组关系，开始设计活动</button>
            </aside>
          </div>
        )}
      </main>
    </WorkbenchShell>
  );
}
