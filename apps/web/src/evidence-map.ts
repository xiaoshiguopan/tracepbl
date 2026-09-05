import { sourceFixture } from "./source-discovery";

export type RelationKind = "背景条件" | "支持原因" | "关键转折" | "后续影响" | "质疑或限制";
export type RelationStatus = "ready" | "needs-review";
export type EvidenceClaim = { id: string; text: string; gapAccepted: boolean };
export type EvidenceRelation = { id: string; claimId: string; sourceId: string; kind: RelationKind; reason: string; status: RelationStatus; citations?: Array<{ sourceVersionId: string; chunkId: number | null; quotedText: string | null }> };
export type EvidenceMapDraft = { fixtureVersion: 2; claims: EvidenceClaim[]; relations: EvidenceRelation[]; confirmed: boolean; questionSnapshot: string; sourceSnapshot: string[] };

export const defaultSubQuestions = [
  "唐朝前期的盛世局面建立在怎样的政治、经济与社会条件上？",
  "安史之乱为什么成为唐朝由盛转衰的关键转折？",
  "安史之乱后，哪些长期问题使唐朝难以恢复并最终灭亡？",
];

function suggestedKind(questionId: number, role: string): RelationKind {
  if (role === "反例限制") return "质疑或限制";
  if (role === "关键转折") return "关键转折";
  if (questionId === 1) return role === "背景条件" ? "背景条件" : "支持原因";
  return "后续影响";
}

export function createEvidenceMapDraft(question: string, selectedIds: string[], subQuestions = defaultSubQuestions): EvidenceMapDraft {
  const claims = (subQuestions.length ? subQuestions : [question]).map((text, index) => ({ id: `QUESTION-${index + 1}`, text, gapAccepted: false }));
  const relations = selectedIds.flatMap((sourceId) => {
    const source = sourceFixture.find((item) => item.id === sourceId);
    if (!source) return [];
    return source.questionIds.filter((id) => id <= claims.length).map((questionId) => ({
      id: `REL-${sourceId}-${questionId}`,
      claimId: `QUESTION-${questionId}`,
      sourceId,
      kind: suggestedKind(questionId, source.role),
      reason: source.interpretation,
      status: "ready" as const,
    }));
  });
  return { fixtureVersion: 2, claims, relations, confirmed: false, questionSnapshot: question, sourceSnapshot: [...selectedIds] };
}

export function getEvidenceMapSummary(draft: EvidenceMapDraft, selectedIds: string[]) {
  const connected = new Set(draft.relations.map((relation) => relation.sourceId));
  return {
    claimCount: draft.claims.length,
    relationCount: draft.relations.length,
    gapCount: draft.claims.filter((claim) => claim.gapAccepted).length,
    unconnectedSourceCount: selectedIds.filter((id) => !connected.has(id)).length,
    ready: draft.claims.length > 0 && draft.claims.every((claim) => claim.gapAccepted || draft.relations.some((relation) => relation.claimId === claim.id)),
  };
}

export function updateEvidenceRelation(draft: EvidenceMapDraft, relationId: string, change: Pick<EvidenceRelation, "kind" | "reason">): EvidenceMapDraft {
  return { ...draft, confirmed: false, relations: draft.relations.map((relation) => relation.id === relationId ? { ...relation, ...change, status: "ready" } : relation) };
}

export function removeEvidenceRelation(draft: EvidenceMapDraft, relationId: string): EvidenceMapDraft {
  return { ...draft, confirmed: false, relations: draft.relations.filter((relation) => relation.id !== relationId) };
}

export function moveEvidenceRelation(draft: EvidenceMapDraft, relationId: string, claimId: string): EvidenceMapDraft {
  const moving = draft.relations.find((relation) => relation.id === relationId);
  if (!moving || moving.claimId === claimId) return draft;
  if (draft.relations.some((relation) => relation.id !== relationId && relation.claimId === claimId && relation.sourceId === moving.sourceId)) return draft;
  return { ...draft, confirmed: false, relations: draft.relations.map((relation) => relation.id === relationId ? { ...relation, claimId } : relation) };
}

export function addEvidenceRelation(draft: EvidenceMapDraft, input: Omit<EvidenceRelation, "id" | "status">): { draft: EvidenceMapDraft; error?: string } {
  if (draft.relations.some((relation) => relation.claimId === input.claimId && relation.sourceId === input.sourceId)) return { draft, error: "这条史料已经用于该问题。" };
  return { draft: { ...draft, confirmed: false, relations: [...draft.relations, { ...input, id: crypto.randomUUID(), status: "ready" }] } };
}

export function normalizeEvidenceMapDraft(draft: EvidenceMapDraft, question: string, selectedIds: string[], subQuestions = defaultSubQuestions): EvidenceMapDraft {
  if (draft.fixtureVersion !== 2) return createEvidenceMapDraft(question, selectedIds, subQuestions);
  const sourcesChanged = draft.sourceSnapshot.length !== selectedIds.length || draft.sourceSnapshot.some((id) => !selectedIds.includes(id));
  const questionsChanged = draft.questionSnapshot !== question || draft.claims.map((claim) => claim.text).join("|") !== (subQuestions.length ? subQuestions : [question]).join("|");
  if (!sourcesChanged && !questionsChanged) return draft;
  const fresh = createEvidenceMapDraft(question, selectedIds, subQuestions);
  const previous = new Map(draft.relations.map((relation) => [`${relation.claimId}|${relation.sourceId}`, relation]));
  return { ...fresh, confirmed: false, relations: fresh.relations.map((relation) => {
    const existing = previous.get(`${relation.claimId}|${relation.sourceId}`);
    return existing ? { ...existing, status: "needs-review" as const } : relation;
  }) };
}
