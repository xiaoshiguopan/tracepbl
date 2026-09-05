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
  it("rejects duplicate embedding indexes instead of attaching vectors to the wrong text", async () => {
    const vector = Array(1024).fill(0); vector[0] = 1;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ model:"embedding-3",data:[{index:0,embedding:vector},{index:0,embedding:vector}],usage:{prompt_tokens:2} }))) as typeof fetch;
    await expect(new GlmProvider("synthetic-test-key",fetcher).embed(["synthetic a","synthetic b"])).rejects.toMatchObject({code:"PROVIDER_OUTPUT_INVALID"});
  });
  it("stops reading oversized chunked responses without content-length", async () => {
    let chunks = 0; let cancelled = false;
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ pull(controller) { chunks++; if(chunks<=20)controller.enqueue(new Uint8Array(262144).fill(32));else controller.close(); },cancel(){cancelled=true;} }))) as typeof fetch;
    await expect(new GlmProvider("synthetic-test-key",fetcher).generateStructured({schema,system:"s",input:"i",maxOutputTokens:10})).rejects.toMatchObject({code:"PROVIDER_OUTPUT_INVALID"});
    expect(chunks).toBeLessThan(10); expect(cancelled).toBe(true);
  });
});
