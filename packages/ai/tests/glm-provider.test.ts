import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GlmProvider } from "../src/glm-provider.js";

const schema = z.object({ answer: z.string() }).strict();
describe("GLM adapter", () => {
  it("rejects a silent model substitution", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model: "another-model", choices: [{ finish_reason: "stop", message: { content: '{"answer":"x"}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200 })) as unknown as typeof fetch;
    await expect(new GlmProvider("synthetic-test-key", fetcher).generateStructured({ schema, system: "s", input: "i", maxOutputTokens: 10 })).rejects.toMatchObject({ code: "PROVIDER_MODEL_MISMATCH" });
  });
  it("validates structured output after JSON mode", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model: "GLM-5.3-Flash", choices: [{ finish_reason: "stop", message: { content: '{"wrong":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200 })) as unknown as typeof fetch;
    await expect(new GlmProvider("synthetic-test-key", fetcher).generateStructured({ schema, system: "s", input: "i", maxOutputTokens: 10 })).rejects.toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
  });
  it("never accepts a client-selected base URL", () => expect(() => new GlmProvider("synthetic-test-key", fetch, "https://example.invalid")).toThrow(/批准范围/));
});
