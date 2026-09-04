import { z } from "zod";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, GENERATION_MODEL, ProviderError, type AiProvider, type GenerateRequest, type GenerateResult } from "./index.ts";

type Fetcher = typeof fetch;
const ALLOWED_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export class GlmProvider implements AiProvider {
  constructor(private readonly apiKey: string, private readonly fetcher: Fetcher = fetch, private readonly baseUrl = ALLOWED_BASE_URL) {
    if (!apiKey) throw new ProviderError("AI_NOT_CONFIGURED", "AI 未配置。");
    if (baseUrl !== ALLOWED_BASE_URL) throw new ProviderError("AI_NOT_CONFIGURED", "GLM 端点不在批准范围内。");
  }
  capabilities() { return { generation: true, embedding: true, reason: null }; }
  async generateStructured<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const payload = await this.post("chat/completions", { model: GENERATION_MODEL, messages: [{ role: "system", content: request.system }, { role: "user", content: request.input }], response_format: { type: "json_object" }, max_tokens: Math.min(request.maxOutputTokens, 4_000), stream: false }, request.signal, 120_000);
    const envelope = generationEnvelope.safeParse(payload); if (!envelope.success) throw new ProviderError("PROVIDER_OUTPUT_INVALID", "GLM 响应外层结构无效。");
    if (envelope.data.model !== GENERATION_MODEL) throw new ProviderError("PROVIDER_MODEL_MISMATCH", "GLM 返回了不同模型。");
    let value: unknown; try { value = JSON.parse(envelope.data.choices[0]!.message.content); } catch { throw new ProviderError("PROVIDER_OUTPUT_INVALID", "GLM 未返回有效 JSON。"); }
    const parsed = request.schema.safeParse(value); if (!parsed.success) throw new ProviderError("PROVIDER_OUTPUT_INVALID", "GLM 输出未通过结构校验。");
    return { value: parsed.data, actualModel: GENERATION_MODEL, usage: { inputTokens: envelope.data.usage.prompt_tokens, outputTokens: envelope.data.usage.completion_tokens, totalTokens: envelope.data.usage.total_tokens } };
  }
  async embed(input: readonly string[], signal?: AbortSignal): Promise<{ vectors: number[][]; actualModel: typeof EMBEDDING_MODEL; inputTokens: number }> {
    if (input.length < 1 || input.length > 64) throw new ProviderError("PROVIDER_OUTPUT_INVALID", "embedding 批次必须为 1—64 项。");
    const payload = await this.post("embeddings", { model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMENSIONS }, signal, 30_000);
    const envelope = embeddingEnvelope.safeParse(payload); if (!envelope.success || envelope.data.data.length !== input.length || envelope.data.data.some((item) => item.embedding.length !== EMBEDDING_DIMENSIONS)) throw new ProviderError("PROVIDER_OUTPUT_INVALID", "embedding 响应结构或维度无效。");
    if (envelope.data.model !== EMBEDDING_MODEL) throw new ProviderError("PROVIDER_MODEL_MISMATCH", "embedding 返回了不同模型。");
    return { vectors: envelope.data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding), actualModel: EMBEDDING_MODEL, inputTokens: envelope.data.usage.prompt_tokens };
  }
  private async post(path: string, body: unknown, signal: AbortSignal | undefined, timeoutMs: number) {
    const timeout = AbortSignal.timeout(timeoutMs); const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try { response = await this.fetcher(`${this.baseUrl}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: combined }); }
    catch { if(signal?.aborted)throw signal.reason??new ProviderError("PROVIDER_UNAVAILABLE","GLM 请求已取消。");if(timeout.aborted)throw new ProviderError("PROVIDER_TIMEOUT_UNKNOWN","GLM 请求超时，结果与费用状态未知。");throw new ProviderError("PROVIDER_UNAVAILABLE", "GLM 连接失败。", true); }
    if (!response.ok) throw new ProviderError("PROVIDER_UNAVAILABLE", "GLM 暂时不可用。", response.status === 429 || response.status >= 500);
    const contentLength = Number(response.headers.get("content-length") ?? 0); if (contentLength > 1_048_576) throw new ProviderError("PROVIDER_OUTPUT_INVALID", "GLM 响应过大。");
    const text = await response.text(); if (Buffer.byteLength(text) > 1_048_576) throw new ProviderError("PROVIDER_OUTPUT_INVALID", "GLM 响应过大。");
    try { return JSON.parse(text) as unknown; } catch { throw new ProviderError("PROVIDER_OUTPUT_INVALID", "GLM 响应不是 JSON。"); }
  }
}

const usageSchema = z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(), total_tokens: z.number().int().nonnegative() }).strict();
const generationEnvelope = z.object({ model: z.string(), choices: z.array(z.object({ finish_reason: z.string(), message: z.object({ content: z.string().max(1_000_000) }).passthrough() }).passthrough()).length(1), usage: usageSchema }).passthrough();
const embeddingEnvelope = z.object({ model: z.string(), data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number()) }).strict()).min(1).max(64), usage: z.object({ prompt_tokens: z.number().int().nonnegative() }).passthrough() }).passthrough();
