import { ProblemSchema, RuntimeSchema, type ProblemCode } from "@tracepbl/contracts";

type Parser<T> = { parse(value: unknown): T };
type Command = { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; version?: number; key?: string; signal?: AbortSignal };
const safeMessages: Partial<Record<ProblemCode, string>> = {
  RESOURCE_NOT_FOUND: "此任务不可使用。", SESSION_REQUIRED: "本地会话已失效，请重新打开页面。",
  VERSION_CONFLICT: "内容已在另一窗口修改。请保留草稿，重新载入后比较修改。",
  INVALID_STATE: "当前状态不允许此操作，请先处理待复核项。", VALIDATION_FAILED: "填写内容不符合要求，请检查后重试。",
  CITATION_GATE_FAILED: "引用与来源版本不一致，请返回组织证据检查。", IDEMPOTENCY_KEY_REUSED: "此操作标识已用于其他请求，请重新发起。",
  PURGE_ALREADY_STARTED: "撤销窗口已结束，或到期清理已经开始。", PRECONDITION_REQUIRED: "缺少内容版本，请重新载入页面。",
  AI_NOT_CONFIGURED: "当前未启用 AI 建议，可继续手工备课。", BUDGET_EXCEEDED: "本地测试额度已达上限，请稍后再试。",
};
export class LocalApiError extends Error {
  readonly code: string; readonly traceId?: string;
  constructor(code: string, message: string, traceId?: string) { super(message); this.code = code; this.traceId = traceId; }
}

let session: Promise<ReturnType<typeof RuntimeSchema.parse>> | undefined;
const pending = new Map<string, { fingerprint: string; promise: Promise<{ data: unknown; etag: string | null }> }>();

function requireLocalOrigin() {
  if (typeof window === "undefined" || !["127.0.0.1", "localhost"].includes(window.location.hostname) || window.location.protocol !== "http:") {
    throw new LocalApiError("MODE_MISMATCH", "完整模式只能从本地 localhost 入口打开。");
  }
}
export function localSession() {
  requireLocalOrigin();
  session ??= fetch("/api/v1/runtime", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) }).then(async response => {
    if (!response.ok) throw new LocalApiError("UNAVAILABLE", "本地服务尚未就绪，请检查 API 和数据库启动状态。");
    try { return RuntimeSchema.parse(await response.json()); }
    catch { throw new LocalApiError("CONTRACT_MISMATCH", "前端与本地服务版本不一致，请使用同一版本重新启动。"); }
  }).catch(error => { session = undefined; throw error instanceof TypeError || error?.name === "TimeoutError" ? new LocalApiError("UNAVAILABLE", "无法连接本地服务，请检查网络及服务状态后重试。") : error; });
  return session;
}

export async function localRequest<T>(path: string, parser: Parser<T>, command: Command = {}): Promise<{ data: T; etag: string | null }> {
  await localSession();
  if (!/^\/api\/v1\/(runtime|tasks)(\/|\?|$)/.test(path) || path.includes("..") || path.includes("\\")) throw new LocalApiError("INVALID_PATH", "操作地址无效。");
  const method = command.method ?? "GET";
  const fingerprint = JSON.stringify([path, method, command.body, command.version]);
  const send = async () => {
    const deadline = AbortSignal.timeout(15000);
    const response = await fetch(path, { method, credentials: "same-origin", redirect: "error", cache: "no-store", signal: command.signal ? AbortSignal.any([command.signal, deadline]) : deadline,
      headers: { ...(method === "GET" ? {} : { "Content-Type": "application/json" }), ...(command.key ? { "Idempotency-Key": command.key } : {}), ...(command.version === undefined ? {} : { "If-Match": `"task-lv-${command.version}"` }) },
      ...(command.body === undefined ? {} : { body: JSON.stringify(command.body) }),
    }).catch(error => { if (error instanceof TypeError || error?.name === "TimeoutError") throw new LocalApiError("UNAVAILABLE", "连接中断，尚不能确定保存结果。请保留草稿并用同一操作重试。"); throw error; });
    if (!response.ok) {
      const result = ProblemSchema.safeParse(await response.json().catch(() => null));
      if (!result.success) throw new LocalApiError("UNAVAILABLE", "本地服务返回了无法读取的响应，当前草稿仍保留。");
      const problem = result.data;
      throw new LocalApiError(problem.code, safeMessages[problem.code] ?? "请求未完成，请稍后重试。", problem.traceId);
    }
    let data: T;
    try { data = parser.parse(await response.json()); }
    catch { throw new LocalApiError("CONTRACT_MISMATCH", "本地服务返回的数据与当前页面不一致，请重新启动同一版本。"); }
    return { data, etag: response.headers.get("etag") };
  };
  if (!command.key) return send();
  const existing = pending.get(command.key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new LocalApiError("IDEMPOTENCY_KEY_REUSED", "另一个请求正在使用此操作标识。");
    return existing.promise as Promise<{ data: T; etag: string | null }>;
  }
  const promise = send().finally(() => pending.delete(command.key!));
  pending.set(command.key, { fingerprint, promise });
  return promise;
}
