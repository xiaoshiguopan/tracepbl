import { describe, expect, it } from "vitest";
import { affectedSections, assertJobTransition, canRestoreTask, deletionWindow, mapStoredJobStatus, reserveBudget } from "../src/index.js";

describe("domain invariants", () => {
  it("never revives a terminal job", () => expect(() => assertJobTransition("cancelled", "running")).toThrow(/不能/));
  it("maps stale without extending the public status enum", () => expect(mapStoredJobStatus("stale")).toEqual({ status: "failed", errorCode: "RESULT_STALE" }));
  it("invalidates only downstream workflow sections", () => expect(affectedSections("evidenceMap")).toEqual(["lessonDesign", "rubric", "audit", "approval"]));
  it("enforces the exact 24 hour restore boundary", () => {
    const start = new Date("2026-09-03T00:00:00Z"); const { purgeAfter } = deletionWindow(start);
    expect(canRestoreTask(new Date(purgeAfter.getTime() - 1), purgeAfter, false)).toBe(true);
    expect(canRestoreTask(purgeAfter, purgeAfter, false)).toBe(false);
    expect(canRestoreTask(start, purgeAfter, true)).toBe(false);
  });
  it("rejects reservations that cross any hard budget", () => expect(() => reserveBudget({ calls: 19, generationTokens: 0, embeddingTokens: 0, cnyMicros: 0 }, { calls: 2, generationTokens: 0, embeddingTokens: 0, cnyMicros: 0 }, { calls: 20, generationTokens: 200000, embeddingTokens: 200000, cnyMicros: 2_000_000 })).toThrow(/额度/));
});
