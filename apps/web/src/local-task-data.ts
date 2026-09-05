import { AuditViewSchema, EvidenceMapSchema, LessonDesignSchema, QuestionSetSchema, RubricSchema, SourceListSchema, SourceSelectionSchema, TaskSchema, TaskDetailSchema, TeachingContextSchema } from "@tracepbl/contracts";
import { LocalApiError, localRequest } from "./local-api";

export type LocalTaskData = {
  task: ReturnType<typeof TaskDetailSchema.parse>;
  context: ReturnType<typeof TeachingContextSchema.parse> | null;
  question: ReturnType<typeof QuestionSetSchema.parse> | null;
  sources: ReturnType<typeof SourceListSchema.parse>["items"];
  evidence: ReturnType<typeof EvidenceMapSchema.parse>;
  lesson: ReturnType<typeof LessonDesignSchema.parse>;
  rubric: ReturnType<typeof RubricSchema.parse>;
  audit: ReturnType<typeof AuditViewSchema.parse> | null;
};

const cache = new Map<string, Promise<LocalTaskData>>();
export function invalidateLocalTask(taskId: string) { cache.delete(taskId); }
export function localTaskData(taskId: string): Promise<LocalTaskData> {
  const previous = cache.get(taskId); if (previous) return previous;
  const promise = read(taskId).catch(error => { cache.delete(taskId); throw error; });
  cache.set(taskId, promise); return promise;
}
async function read(taskId: string): Promise<LocalTaskData> {
  const path = `/api/v1/tasks/${encodeURIComponent(taskId)}`;
  const { data: task } = await localRequest(path, TaskDetailSchema);
  const [context, question, sources, evidence, lesson, rubric, audit] = await Promise.all([
    localRequest(`${path}/context`, TeachingContextSchema.nullable()),
    localRequest(`${path}/question-set`, QuestionSetSchema.nullable()),
    localRequest(`${path}/sources`, SourceListSchema),
    localRequest(`${path}/evidence-map`, EvidenceMapSchema),
    localRequest(`${path}/lesson-design`, LessonDesignSchema),
    localRequest(`${path}/rubric`, RubricSchema),
    task.latestAuditId ? localRequest(`${path}/audits/${task.latestAuditId}`, AuditViewSchema) : Promise.resolve(null),
  ]);
  const after = await localRequest(path, TaskDetailSchema);
  if (task.lockVersion !== after.data.lockVersion) throw new LocalApiError("VERSION_CONFLICT", "读取期间内容发生变化，请重新载入。");
  return { task: after.data, context: context.data, question: question.data, sources: sources.data.items, evidence: evidence.data, lesson: lesson.data, rubric: rubric.data, audit: audit?.data ?? null };
}

export async function saveLocalSection(taskId: string, section: "context" | "question-set" | "source-selection" | "evidence-map" | "lesson-design" | "rubric", body: unknown) {
  const current = await localTaskData(taskId);
  const parsers = { context: TeachingContextSchema, "question-set": QuestionSetSchema, "source-selection": SourceSelectionSchema, "evidence-map": EvidenceMapSchema, "lesson-design": LessonDesignSchema, rubric: RubricSchema };
  parsers[section].parse(body);
  const responseParser = { parse: (value: unknown) => section === "context" ? TaskSchema.parse(value) : parsers[section].parse(value) };
  await localRequest(`/api/v1/tasks/${taskId}/${section}`, responseParser, { method: "PUT", body, version: current.task.lockVersion });
  invalidateLocalTask(taskId);
  window.dispatchEvent(new CustomEvent("tracepbl-task-saved", { detail: { taskId } }));
}
