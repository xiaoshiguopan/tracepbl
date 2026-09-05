export type WorkspaceScope = Readonly<{ workspaceId: string; sessionId: string }>;
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "stale";
export type JobKind = "source_check" | "embedding" | "model" | "audit" | "export" | "purge";

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export class NotFoundError extends DomainError { constructor() { super("RESOURCE_NOT_FOUND", "该资源不存在或不可访问。"); } }
export class VersionConflictError extends DomainError { constructor() { super("VERSION_CONFLICT", "内容已在另一窗口发生变化，请重新加载。"); } }

export function requireCurrentVersion(expected: number, actual: number) {
  if (expected !== actual) throw new VersionConflictError();
}

export function canTransitionJob(from: JobStatus, to: JobStatus) {
  if (["succeeded", "failed", "cancelled", "stale"].includes(from)) return from === to;
  if (from === "queued") return ["queued", "running", "cancelled"].includes(to);
  return ["running", "queued", "succeeded", "failed", "cancelled", "stale"].includes(to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus) {
  if (!canTransitionJob(from, to)) throw new DomainError("INVALID_STATE", "运行状态不能进行该转换。");
}

export type BudgetLimits = Readonly<{ calls: number; generationTokens: number; embeddingTokens: number; cnyMicros: number }>;
export type BudgetUsage = Readonly<{ calls: number; generationTokens: number; embeddingTokens: number; cnyMicros: number }>;
export function reserveBudget(usage: BudgetUsage, request: BudgetUsage, limits: BudgetLimits): BudgetUsage {
  const next = { calls: usage.calls + request.calls, generationTokens: usage.generationTokens + request.generationTokens, embeddingTokens: usage.embeddingTokens + request.embeddingTokens, cnyMicros: usage.cnyMicros + request.cnyMicros };
  if (next.calls > limits.calls || next.generationTokens > limits.generationTokens || next.embeddingTokens > limits.embeddingTokens || next.cnyMicros > limits.cnyMicros) {
    throw new DomainError("BUDGET_EXCEEDED", "今日 AI 使用额度不足。");
  }
  return next;
}

export const DELETE_GRACE_MS = 24 * 60 * 60 * 1000;
export function deletionWindow(deletedAt: Date) { return { deletedAt, purgeAfter: new Date(deletedAt.getTime() + DELETE_GRACE_MS) }; }
export function canRestoreTask(now: Date, purgeAfter: Date, purgeClaimed: boolean) { return !purgeClaimed && now.getTime() < purgeAfter.getTime(); }

export type WorkflowSection = "context" | "questionSet" | "sourceSelection" | "evidenceMap" | "lessonDesign" | "rubric" | "audit" | "approval";
const downstream: Record<WorkflowSection, WorkflowSection[]> = {
  context: ["questionSet", "sourceSelection", "evidenceMap", "lessonDesign", "rubric", "audit", "approval"],
  questionSet: ["sourceSelection", "evidenceMap", "lessonDesign", "rubric", "audit", "approval"],
  sourceSelection: ["evidenceMap", "lessonDesign", "rubric", "audit", "approval"],
  evidenceMap: ["lessonDesign", "rubric", "audit", "approval"],
  lessonDesign: ["rubric", "audit", "approval"], rubric: ["audit", "approval"], audit: ["approval"], approval: [],
};
export function affectedSections(changed: WorkflowSection) { return [...downstream[changed]]; }

export function mapStoredJobStatus(status: JobStatus) {
  if (status === "stale") return { status: "failed" as const, errorCode: "RESULT_STALE" };
  return { status };
}

const sensitiveDataPattern = /(身份证|手机号|联系电话|学生姓名|班级名单|家庭住址|api[_ -]?key|bearer\s+[a-z0-9._-]+)/i;
export function containsSensitiveData(value: string) { return sensitiveDataPattern.test(value); }
export { fakePriceProfile, realPriceProfile, generationReservation, generationCost, type PriceProfile } from "./pricing.ts";
