import { DecisionResultSchema, DeletionWindowSchema, SourceSelectionSchema, TaskListSchema, TaskSchema } from "@tracepbl/contracts";
import { localRequest } from "./local-api";
import { invalidateLocalTask, localTaskData, saveLocalSection } from "./local-task-data";
import { localViewModel, relationKeys } from "./local-view-model";
import type { TaskBackup, TaskSummary } from "./teaching-context-store";
import type { TeachingContextDraft } from "./teaching-context";
import type { QuestionWorkspaceDraft } from "./question-workspace";
import type { SourceDiscoveryDraft } from "./source-discovery";
import type { EvidenceMapDraft } from "./evidence-map";
import type { LessonDesignDraft } from "./lesson-design";
import type { RubricDraft } from "./rubric-design";
import type { AuditDraft } from "./design-audit";
import type { FinalReviewDraft } from "./final-review";

type Views = ReturnType<typeof localViewModel>;
export async function loadLocalDraft<K extends keyof Views>(taskId: string, kind: K): Promise<Views[K]> {
  return localViewModel(await localTaskData(taskId))[kind];
}
export async function saveLocalContext(task: string, draft: TeachingContextDraft) {
  await saveLocalSection(task, "context", { stage: draft.stage, grade: draft.grade, textbook: draft.textbook, lesson: draft.lesson, minutes: Number(draft.minutes), lessonTypes: draft.lessonTypes, inquiryDirection: draft.inquiryQuestion || null, priorKnowledge: draft.priorKnowledge || null, learningNeeds: draft.learningNeeds, profileNote: draft.profileNote || null });
}
export async function saveLocalQuestion(task: string, draft: QuestionWorkspaceDraft) {
  await saveLocalSection(task, "question-set", { centralQuestion: draft.centralQuestion, subQuestions: draft.subQuestions, focus: draft.subQuestions.length === 1 ? undefined : draft.focus, inputType: draft.inputType || null, evidenceOutcome: draft.evidenceOutcome || undefined, scopeBoundary: draft.scopeBoundary || undefined, confirmed: draft.confirmed });
}
export async function saveLocalSources(task: string, draft: SourceDiscoveryDraft) {
  await saveLocalSection(task, "source-selection", SourceSelectionSchema.parse({ sourceVersionIds: draft.selectedIds }));
}
export async function saveLocalEvidence(task: string, draft: EvidenceMapDraft) {
  const current = await localTaskData(task);
  await saveLocalSection(task, "evidence-map", { claims: draft.claims.map(claim => ({ text: claim.text, gapAccepted: claim.gapAccepted, relations: draft.relations.filter(relation => relation.claimId === claim.id).map(relation => {
    const old = current.evidence.claims.flatMap(item => item.relations).find(item => item.sourceVersionId === relation.sourceId && item.kind === relationKeys[relation.kind]);
    return { sourceVersionId: relation.sourceId, kind: relationKeys[relation.kind], reason: relation.reason, citations: relation.citations ?? (old?.citations.length ? old.citations : [{ sourceVersionId: relation.sourceId, chunkId: null, quotedText: null }]) };
  }) })) });
}
export async function saveLocalLesson(task: string, draft: LessonDesignDraft) {
  await saveLocalSection(task, "lesson-design", { activities: draft.activities.map(activity => ({ title: activity.title, activityMinutes: activity.minutes, transitionMinutes: activity.transitionMinutes, sourceVersionIds: activity.sourceIds, studentAction: activity.studentAction, evidenceProduct: activity.evidenceProduct, difficulty: activity.difficulty, scaffold: activity.scaffold })) });
}
export async function saveLocalRubric(task: string, draft: RubricDraft) {
  const current = localViewModel(await localTaskData(task));
  await saveLocalSection(task, "rubric", { items: draft.dimensions.map(dimension => ({ title: dimension.title, levels: dimension.levels, activityOrdinals: dimension.activityIds.map(id => current.lesson.activities.findIndex(activity => activity.id === id)) })) });
}
const pendingRiskDecisions = new Map<string, string>();
export async function saveLocalAudit(task: string, draft: AuditDraft) {
  const current = await localTaskData(task);
  for (const finding of draft.findings) {
    const previous = current.audit?.findings.find(item => item.id === finding.id);
    if (finding.resolution !== "accepted" || !previous || (previous.resolutionState === "accepted" && previous.teacherReason === finding.teacherReason)) continue;
    const fingerprint = JSON.stringify([task, current.task.lockVersion, finding.id, finding.teacherReason]);
    const key = pendingRiskDecisions.get(fingerprint) ?? crypto.randomUUID(); pendingRiskDecisions.set(fingerprint, key);
    await localRequest(`/api/v1/tasks/${task}/decisions`, DecisionResultSchema, { method: "POST", version: current.task.lockVersion, key, body: { kind: "acceptRisk", findingId: finding.id, reason: finding.teacherReason } });
    pendingRiskDecisions.delete(fingerprint); invalidateLocalTask(task);
  }
  invalidateLocalTask(task);
}
export async function saveLocalReview(task: string, draft: FinalReviewDraft) {
  const current = await localTaskData(task);
  if (!draft.approved || current.task.workflowState === "approved") return;
  await localRequest(`/api/v1/tasks/${task}/decisions`, DecisionResultSchema, { method: "POST", version: current.task.lockVersion, key: crypto.randomUUID(), body: { kind: "approve", taskRevisionId: current.task.latestTeacherRevisionId } });
  invalidateLocalTask(task);
}
export async function listLocalTasks(): Promise<TaskSummary[]> {
  const tasks: TaskSummary[] = []; let cursor: string | null = null;
  do {
    const { data }: { data: ReturnType<typeof TaskListSchema.parse> } = await localRequest(`/api/v1/tasks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, TaskListSchema);
    tasks.push(...data.items.map(task => ({ id: task.id, title: task.title, grade: "", minutes: "", createdAt: task.createdAt, updatedAt: task.updatedAt, reachedStep: task.workflowState === "approved" ? 7 : 0, revision: task.lockVersion })));
    cursor = data.nextCursor;
  } while (cursor);
  return tasks;
}
export async function createLocalTask(key: string) {
  const { data } = await localRequest("/api/v1/tasks", TaskSchema, { method: "POST", key, body: { title: "新建备课" } }); return data.id;
}
export async function deleteLocalTask(taskId: string): Promise<TaskBackup> {
  const current = await localTaskData(taskId);
  const { data } = await localRequest(`/api/v1/tasks/${taskId}`, DeletionWindowSchema, { method: "DELETE", key: crypto.randomUUID(), version: current.task.lockVersion, body: { impactConfirmed: true } });
  invalidateLocalTask(taskId);
  return { task: { id: taskId, title: current.task.title, grade: "", minutes: "", createdAt: current.task.createdAt, updatedAt: current.task.updatedAt, revision: data.lockVersion, reachedStep: 0 }, drafts: { deletionWindow: data } };
}
export async function restoreLocalTask(backup: TaskBackup) {
  await localRequest(`/api/v1/tasks/${backup.task.id}/restorations`, TaskSchema, { method: "POST", version: backup.task.revision, key: crypto.randomUUID(), body: {} }); invalidateLocalTask(backup.task.id);
}
export async function copyLocalTask(task: string, key: string) {
  await localRequest(`/api/v1/tasks/${task}/copies`, TaskSchema, { method: "POST", key, body: {} });
}
