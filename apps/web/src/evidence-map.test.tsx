import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceMapPage } from "./EvidenceMapPage";
import {
  addEvidenceRelation,
  createEvidenceMapDraft,
  getEvidenceMapSummary,
  normalizeEvidenceMapDraft,
  removeEvidenceRelation,
  updateEvidenceRelation,
  type EvidenceMapDraft,
} from "./evidence-map";

const question = "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？";
const selectedIds = ["AUTH-SRC-001", "AUTH-SRC-002", "AUTH-SRC-003", "AUTH-SRC-004"];

describe("P05 组织证据", () => {
  it("以论证草案和证据账簿呈现预排关系，而不是复杂拖拽图", () => {
    const html = renderToStaticMarkup(
      <EvidenceMapPage
        onBack={() => undefined}
        onReturnContext={() => undefined}
        onReturnQuestion={() => undefined}
        onReturnSources={() => undefined}
      />,
    );

    expect(html).toContain("组织证据");
    expect(html).toContain("论证草案");
    expect(html).toContain("证据账簿");
    expect(html).toContain("预生成合成建议");
    expect(html).toContain("支持");
    expect(html).toContain("补充语境");
    expect(html).toContain("证据缺口");
    expect(html).not.toContain("draggable");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("<audio");
  });

  it("用 3 个待判断命题组织 4 条已选官方史料并保留一个明确缺口", () => {
    const draft = createEvidenceMapDraft(question, selectedIds);
    expect(draft.claims).toHaveLength(3);
    expect(draft.relations).toHaveLength(4);
    expect(draft.claims.every((claim) => claim.text.endsWith("？"))).toBe(true);
    expect(getEvidenceMapSummary(draft, selectedIds)).toMatchObject({
      claimCount: 3,
      relationCount: 4,
      gapCount: 1,
      unconnectedSourceCount: 0,
      ready: true,
    });
  });

  it("关系增删改保持不可变，并拒绝同一命题的重复史料关系", () => {
    const original = createEvidenceMapDraft(question, selectedIds);
    const changed = updateEvidenceRelation(original, "REL-001", { kind: "质疑", reason: "用于检验政治叙事的边界。" });
    const removed = removeEvidenceRelation(changed, "REL-001");
    const duplicate = addEvidenceRelation(original, {
      claimId: "CLAIM-001",
      sourceId: "AUTH-SRC-001",
      kind: "支持",
      reason: "重复关系。",
    });

    expect(original.relations[0].kind).toBe("支持");
    expect(changed.relations[0]).toMatchObject({ kind: "质疑", status: "ready" });
    expect(removed.relations).toHaveLength(3);
    expect(duplicate.error).toBe("这条史料已关联到该命题，请编辑原关系。");
    const added = addEvidenceRelation(removed, { claimId: "CLAIM-003", sourceId: "AUTH-SRC-001", kind: "不能支持", reason: "用于显露当前证据缺口。" });
    expect(new Set(added.draft.relations.map((relation) => relation.id)).size).toBe(4);
  });

  it("问题或史料选择变化后把既有关系降为待复核", () => {
    const original = createEvidenceMapDraft(question, selectedIds);
    const normalized = normalizeEvidenceMapDraft(original, `${question}（已修改）`, selectedIds.slice(0, 3));
    expect(normalized.confirmed).toBe(false);
    expect(normalized.relations.every((relation) => relation.status === "needs-review")).toBe(true);
    expect(normalizeEvidenceMapDraft(original, question, [...selectedIds].reverse())).toBe(original);

    const emptyDraft = createEvidenceMapDraft(question, []);
    expect(normalizeEvidenceMapDraft(emptyDraft, question, selectedIds).relations).toHaveLength(4);

    const legacyDraft = { ...original, fixtureVersion: undefined } as unknown as EvidenceMapDraft;
    expect(normalizeEvidenceMapDraft(legacyDraft, question, selectedIds).relations).toHaveLength(4);
  });
});
