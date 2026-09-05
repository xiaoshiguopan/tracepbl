import { describe, expect, it } from "vitest";
import { projectExportSnapshot } from "../src/export-snapshot.ts";

function frozen() {
  return {
    exportContentVersion: 1,
    context: { stage: "junior" }, questionSet: { subQuestions: [], evidenceOutcome: null, scopeBoundary: null },
    frozenSources: [{ versionId: "frozen-v1", title: "冻结标题", locator: "冻结定位", url: null, rightsState: "restricted_metadata_only", contentText: "不允许输出", contextNote: "不允许输出", meaningNote: "不允许输出", interpretationNote: "不允许输出" }],
    evidenceMap: { claims: [{ relations: [{ sourceVersionId: "frozen-v1", citations: [{ sourceVersionId: "frozen-v1", chunkId: 1, quotedText: "不允许输出" }] }] }] },
    lessonDesign: { activities: [] }, rubric: { items: [] },
  };
}

describe("immutable export projection", () => {
  it("fails closed for legacy snapshots without frozen source content", () => {
    expect(() => projectExportSnapshot({ context: {} })).toThrow("重新复核");
  });
  it("uses frozen titles and suppresses restricted text and quotations without mutating history", () => {
    const snapshot = frozen(); const original = JSON.stringify(snapshot);
    const result = projectExportSnapshot(snapshot);
    expect(result.citations).toEqual([{ title: "冻结标题", locator: "冻结定位", url: null }]);
    expect(JSON.stringify(result)).not.toContain("不允许输出");
    expect(result.content.context.stage).toBe("初中");
    expect(JSON.stringify(snapshot)).toBe(original);
  });
  it("preserves permitted frozen content and paired citation identifiers", () => {
    const snapshot = frozen(); snapshot.frozenSources[0]!.rightsState = "verified_reusable";
    expect(JSON.stringify(projectExportSnapshot(snapshot))).toContain("不允许输出");
    expect(projectExportSnapshot(snapshot).content.evidenceMap.claims[0]?.relations[0]?.citations[0]).toMatchObject({ chunkId: 1, quotedText: "不允许输出" });
  });
});
