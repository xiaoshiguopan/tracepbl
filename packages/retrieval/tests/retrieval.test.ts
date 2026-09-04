import { describe, expect, it } from "vitest";
import { CHUNK_MAX, chunkSource, normalizeSourceText, selectContext, validateCitation } from "../src/index.js";

describe("deterministic retrieval rules", () => {
  it("normalizes and chunks deterministically within the hard bound", () => {
    const source = `${"甲".repeat(700)}。\r\n${"乙".repeat(900)}。`;
    const first = chunkSource(source); const second = chunkSource(source);
    expect(first).toEqual(second); expect(first.length).toBeGreaterThan(1);
    expect(first.every((chunk) => Array.from(chunk.contentText).length <= CHUNK_MAX)).toBe(true);
    expect(normalizeSourceText("甲  \r\n 乙")).toBe("甲\n乙");
  });
  it("requires an exact selected hit and normalized substring", () => {
    const hit = { modelRunId: "run", taskId: "task", sourceVersionId: "source", chunkId: 1, contentText: "甲 乙。", selectedForContext: true };
    expect(validateCitation({ modelRunId: "run", taskId: "task", sourceVersionId: "source", chunkId: 1, quotedText: "甲 乙" }, hit)).toBe(true);
    expect(validateCitation({ modelRunId: "other", taskId: "task", sourceVersionId: "source", chunkId: 1, quotedText: "甲 乙" }, hit)).toBe(false);
  });
  it("caps context at eight and three per source", () => {
    const hits = Array.from({ length: 12 }, (_, index) => ({ sourceVersionId: index < 6 ? "a" : `s${index}`, chunkId: index, cosineDistance: index / 100, keywordScore: 0 }));
    const selected = selectContext(hits);
    expect(selected).toHaveLength(8); expect(selected.filter((hit) => hit.sourceVersionId === "a")).toHaveLength(3);
  });
});
