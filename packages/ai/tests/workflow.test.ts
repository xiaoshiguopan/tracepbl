import { Command, MemorySaver } from "@langchain/langgraph";
import { describe, expect, it, vi } from "vitest";
import { buildProposalGraph } from "../src/workflow.js";

describe("short proposal graph", () => {
  it("resumes a teacher interrupt without repeating generation", async () => {
    const generateOnce = vi.fn(async () => ({ modelRunId: crypto.randomUUID(), generatedRevisionId: crypto.randomUUID() }));
    const graph = buildProposalGraph({ freeze: async () => ({ frozen: true }), retrieve: async () => ({ retrievalHitIds: ["hit-1"] }), generateOnce, validate: async () => ({ validated: true }) }, new MemorySaver());
    const config = { configurable: { thread_id: crypto.randomUUID() } };
    const paused = await graph.invoke({ taskId: crypto.randomUUID(), inputLockVersion: 2, frozen: false, retrievalHitIds: [], modelRunId: "", generatedRevisionId: "", validated: false, decisionId: "" }, config);
    expect((paused as typeof paused & { __interrupt__: unknown[] }).__interrupt__).toHaveLength(1);
    const resumed = await graph.invoke(new Command({ resume: "decision-1" }), config);
    expect(resumed.decisionId).toBe("decision-1"); expect(generateOnce).toHaveBeenCalledTimes(1);
  });
});
