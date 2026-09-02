export type RelationKind = "支持" | "质疑" | "补充语境" | "不能支持";
export type RelationStatus = "ready" | "needs-review";

export type EvidenceClaim = {
  id: string;
  text: string;
  gapAccepted: boolean;
};

export type EvidenceRelation = {
  id: string;
  claimId: string;
  sourceId: string;
  kind: RelationKind;
  reason: string;
  status: RelationStatus;
};

export type EvidenceMapDraft = {
  fixtureVersion: 1;
  claims: EvidenceClaim[];
  relations: EvidenceRelation[];
  confirmed: boolean;
  questionSnapshot: string;
  sourceSnapshot: string[];
};

const suggestedClaims: EvidenceClaim[] = [
  { id: "CLAIM-001", text: "政治运行是否足以支持‘盛世’判断？", gapAccepted: false },
  { id: "CLAIM-002", text: "物质文化与跨域交流能否说明社会活力？", gapAccepted: false },
  { id: "CLAIM-003", text: "哪些群体、地区或时期尚未被当前史料覆盖？", gapAccepted: true },
];

const suggestedRelations: Omit<EvidenceRelation, "status">[] = [
  { id: "REL-001", claimId: "CLAIM-001", sourceId: "AUTH-SRC-001", kind: "支持", reason: "呈现后世政治叙事如何概括贞观时期。" },
  { id: "REL-002", claimId: "CLAIM-001", sourceId: "AUTH-SRC-003", kind: "补充语境", reason: "补入宫廷图像中的政治秩序与对外交往表达。" },
  { id: "REL-003", claimId: "CLAIM-002", sourceId: "AUTH-SRC-002", kind: "支持", reason: "提供工艺、乐舞和胡汉交流的考古实物线索。" },
  { id: "REL-004", claimId: "CLAIM-002", sourceId: "AUTH-SRC-004", kind: "补充语境", reason: "补入宫廷宴乐、金银器工艺和跨文化器形。" },
];

export function createEvidenceMapDraft(question: string, selectedIds: string[]): EvidenceMapDraft {
  return {
    fixtureVersion: 1,
    claims: suggestedClaims.map((claim) => ({ ...claim })),
    relations: suggestedRelations
      .filter((relation) => selectedIds.includes(relation.sourceId))
      .map((relation) => ({ ...relation, status: "ready" })),
    confirmed: false,
    questionSnapshot: question,
    sourceSnapshot: [...selectedIds],
  };
}

export function getEvidenceMapSummary(draft: EvidenceMapDraft, selectedIds: string[]) {
  const connected = new Set(draft.relations.map((relation) => relation.sourceId));
  const gapCount = draft.claims.filter((claim) => claim.gapAccepted).length;
  return {
    claimCount: draft.claims.length,
    relationCount: draft.relations.length,
    gapCount,
    unconnectedSourceCount: selectedIds.filter((id) => !connected.has(id)).length,
    ready: draft.claims.length > 0
      && draft.claims.every((claim) => claim.gapAccepted || draft.relations.some((relation) => relation.claimId === claim.id))
      && draft.relations.every((relation) => relation.status === "ready" && relation.reason.trim().length > 0),
  };
}

export function updateEvidenceRelation(draft: EvidenceMapDraft, relationId: string, change: Pick<EvidenceRelation, "kind" | "reason">): EvidenceMapDraft {
  return {
    ...draft,
    confirmed: false,
    relations: draft.relations.map((relation) => relation.id === relationId ? { ...relation, ...change, status: "ready" } : relation),
  };
}

export function removeEvidenceRelation(draft: EvidenceMapDraft, relationId: string): EvidenceMapDraft {
  return { ...draft, confirmed: false, relations: draft.relations.filter((relation) => relation.id !== relationId) };
}

export function addEvidenceRelation(draft: EvidenceMapDraft, input: Omit<EvidenceRelation, "id" | "status">): { draft: EvidenceMapDraft; error?: string } {
  if (draft.relations.some((relation) => relation.claimId === input.claimId && relation.sourceId === input.sourceId)) {
    return { draft, error: "这条史料已关联到该命题，请编辑原关系。" };
  }
  const nextNumber = draft.relations.reduce((highest, relation) => Math.max(highest, Number(relation.id.replace("REL-", "")) || 0), 0) + 1;
  return {
    draft: {
      ...draft,
      confirmed: false,
      relations: [...draft.relations, { ...input, id: `REL-${String(nextNumber).padStart(3, "0")}`, status: "ready" }],
    },
  };
}

export function normalizeEvidenceMapDraft(draft: EvidenceMapDraft, question: string, selectedIds: string[]): EvidenceMapDraft {
  if (draft.fixtureVersion !== 1) return createEvidenceMapDraft(question, selectedIds);
  if (draft.sourceSnapshot.length === 0 && draft.relations.length === 0 && selectedIds.length > 0) {
    return createEvidenceMapDraft(question, selectedIds);
  }
  const sourcesChanged = draft.sourceSnapshot.length !== selectedIds.length || draft.sourceSnapshot.some((id) => !selectedIds.includes(id));
  const changed = draft.questionSnapshot !== question || sourcesChanged;
  if (!changed) return draft;
  return {
    ...draft,
    confirmed: false,
    questionSnapshot: question,
    sourceSnapshot: [...selectedIds],
    relations: draft.relations.map((relation) => ({ ...relation, status: "needs-review" })),
  };
}
