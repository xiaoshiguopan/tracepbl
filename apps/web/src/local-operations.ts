import { AsyncOperationSchema, AuditOperationSchema, ExportManifestSchema, ExportOperationSchema, GeneratedProposalSchema, OperationListSchema, OperationStatusSchema, TaskSchema, type OperationStatus } from "@tracepbl/contracts";
import { localRequest } from "./local-api";
import { invalidateLocalTask, localTaskData } from "./local-task-data";

export type ProposalPurpose = "questionGuidance" | "evidenceAnalysis" | "lesson" | "rubric";
export async function createLocalOperation(taskId: string, purpose: ProposalPurpose | "audit", key: string) {
  const { task } = await localTaskData(taskId);
  const body = purpose === "audit" ? { baseLockVersion: task.lockVersion } : { purpose, baseLockVersion: task.lockVersion, disclosureVersion: "ai-disclosure.v1" };
  const result = await localRequest(`/api/v1/tasks/${taskId}/${purpose === "audit" ? "audits" : "proposals"}`, purpose === "audit" ? AuditOperationSchema : AsyncOperationSchema, { method: "POST", body, version: task.lockVersion, key });
  return result.data.operation;
}
export async function listLocalOperations(taskId: string) {
  const items: OperationStatus[] = []; let cursor: string | null = null;
  do { const result: { data: ReturnType<typeof OperationListSchema.parse> } = await localRequest(`/api/v1/tasks/${taskId}/operations?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, OperationListSchema); items.push(...result.data.items); cursor = result.data.nextCursor; } while (cursor);
  return items;
}
export async function cancelLocalOperation(taskId: string, id: string, key: string) {
  return localRequest(`/api/v1/tasks/${taskId}/operations/${id}`, OperationStatusSchema, { method: "DELETE", body: {}, key });
}
export async function readLocalProposal(taskId: string, operation: { result?: { href?: string } | null }) {
  const href = operation.result?.href;
  if (!href || !new RegExp(`^/api/v1/tasks/${taskId}/proposals/[0-9a-f-]{36}$`).test(href)) throw new Error("当前结果不是可审阅建议。");
  return (await localRequest(href, GeneratedProposalSchema)).data;
}
export async function adoptLocalProposal(taskId: string, proposal: ReturnType<typeof GeneratedProposalSchema.parse>, key: string, reviewedContent?: Record<string, unknown>) {
  const sections = { questionGuidance: "questionSet", evidenceAnalysis: "evidenceMap", lesson: "lessonDesign", rubric: "rubric" };
  if (!(proposal.purpose in sections)) throw new Error("该结果不能采用到备课内容。");
  await localRequest(`/api/v1/tasks/${taskId}/proposals/${proposal.revisionId}/adoption`, TaskSchema, { method: "POST", key, version: proposal.baseLockVersion, body: { generatedRevisionId: proposal.revisionId, baseLockVersion: proposal.baseLockVersion, sections: [sections[proposal.purpose as keyof typeof sections]], ...(reviewedContent ? { reviewedContent } : {}) } });
  invalidateLocalTask(taskId);
}
export async function localExport(taskId: string, format: "pdf" | "docx", fileName: string, key: string) {
  const current = await localTaskData(taskId);
  const result = await localRequest(`/api/v1/tasks/${taskId}/exports`, ExportOperationSchema, { method: "POST", version: current.task.lockVersion, key, body: { format, fileName } });
  let operation = result.data.operation;
  const deadline = Date.now() + 60_000;
  while (operation.status === "queued" || operation.status === "running") {
    if (Date.now() > deadline) throw new Error("导出仍在后台处理；稍后使用同一按钮重试可继续读取该请求。");
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    operation = (await localRequest(`/api/v1/tasks/${taskId}/operations/${operation.id}`, OperationStatusSchema)).data;
  }
  if (operation.status !== "succeeded") throw new Error("导出未成功，可能已取消或源修订过期，请查看后台任务。");
  return (await localRequest(`/api/v1/tasks/${taskId}/exports/${result.data.exportId}/manifest`, ExportManifestSchema)).data;
}
