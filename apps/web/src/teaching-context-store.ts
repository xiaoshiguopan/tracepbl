import { isLocalMode } from "./runtime-mode";
import type { TeachingContextDraft } from "./teaching-context";
import type { QuestionWorkspaceDraft } from "./question-workspace";
import type { SourceDiscoveryDraft } from "./source-discovery";
import type { EvidenceMapDraft } from "./evidence-map";
import type { LessonDesignDraft } from "./lesson-design";
import type { RubricDraft } from "./rubric-design";
import type { AuditDraft } from "./design-audit";
import type { FinalReviewDraft } from "./final-review";

const DB_NAME = "tracepbl-demo";
const CONTEXT_STORE = "teaching-context-drafts";
const QUESTION_STORE = "question-workspace-drafts";
const SOURCE_STORE = "source-discovery-drafts";
const EVIDENCE_STORE = "evidence-map-drafts";
const LESSON_STORE = "lesson-design-drafts";
const RUBRIC_STORE = "rubric-design-drafts";
const AUDIT_STORE = "design-audit-drafts";
const FINAL_REVIEW_STORE = "final-review-drafts";
const TASK_STORE = "tasks";
const DB_VERSION = 9;

export type TaskSummary = {
  id: string;
  title: string;
  grade: string;
  minutes: string;
  createdAt: string;
  updatedAt: string;
  reachedStep: number;
  revision: number;
};

export type TaskBackup = {
  task: TaskSummary;
  drafts: Record<string, unknown>;
};

const draftStores = [CONTEXT_STORE, QUESTION_STORE, SOURCE_STORE, EVIDENCE_STORE, LESSON_STORE, RUBRIC_STORE, AUDIT_STORE, FINAL_REVIEW_STORE];
const clientId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const taskChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(isLocalMode ? "tracepbl-local-tasks" : "tracepbl-tasks") : null;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CONTEXT_STORE)) {
        request.result.createObjectStore(CONTEXT_STORE);
      }
      if (!request.result.objectStoreNames.contains(QUESTION_STORE)) {
        request.result.createObjectStore(QUESTION_STORE);
      }
      if (!request.result.objectStoreNames.contains(SOURCE_STORE)) {
        request.result.createObjectStore(SOURCE_STORE);
      }
      if (!request.result.objectStoreNames.contains(EVIDENCE_STORE)) {
        request.result.createObjectStore(EVIDENCE_STORE);
      }
      if (!request.result.objectStoreNames.contains(LESSON_STORE)) {
        request.result.createObjectStore(LESSON_STORE);
      }
      if (!request.result.objectStoreNames.contains(RUBRIC_STORE)) {
        request.result.createObjectStore(RUBRIC_STORE);
      }
      if (!request.result.objectStoreNames.contains(AUDIT_STORE)) {
        request.result.createObjectStore(AUDIT_STORE);
      }
      if (!request.result.objectStoreNames.contains(FINAL_REVIEW_STORE)) {
        request.result.createObjectStore(FINAL_REVIEW_STORE);
      }
      if (!request.result.objectStoreNames.contains(TASK_STORE)) {
        request.result.createObjectStore(TASK_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("local-storage-open-failed"));
  });
}

async function loadDraft<Value>(storeName: string, taskRef: string) {
  const database = await openDatabase();
  return new Promise<Value | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName);
    const request = transaction.objectStore(storeName).get(taskRef);
    request.onsuccess = () => resolve(request.result as Value | undefined);
    request.onerror = () => reject(request.error ?? new Error("local-draft-read-failed"));
    transaction.oncomplete = () => database.close();
  });
}

async function saveDraft<Value>(storeName: string, taskRef: string, draft: Value) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(draft, taskRef);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("local-draft-write-failed"));
  });
}

async function readTask(taskRef: string) {
  const database = await openDatabase();
  return new Promise<TaskSummary | undefined>((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE);
    const request = transaction.objectStore(TASK_STORE).get(taskRef);
    request.onsuccess = () => resolve(request.result as TaskSummary | undefined);
    request.onerror = () => reject(request.error ?? new Error("task-read-failed"));
    transaction.oncomplete = () => database.close();
  });
}

async function writeTask(task: TaskSummary, notify = true) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    transaction.objectStore(TASK_STORE).put(task);
    transaction.oncomplete = () => {
      database.close();
      if (notify) taskChannel?.postMessage({ taskId: task.id, revision: task.revision, sourceId: clientId });
      if (notify && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tracepbl-task-saved", { detail: { taskId: task.id } }));
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("task-write-failed"));
  });
}

async function touchTask(taskRef: string, context?: TeachingContextDraft, reachedStep?: number) {
  if (taskRef.includes(":scenario:")) return;
  const previous = await readTask(taskRef);
  if (!previous && !context) return;
  const now = new Date().toISOString();
  const title = context
    ? [context.grade, context.lesson.replace(/\s+/g, " ").trim()].filter(Boolean).join("｜") || "未命名备课"
    : previous?.title || "未命名备课";
  await writeTask({
    id: taskRef,
    title,
    grade: context?.grade || previous?.grade || "",
    minutes: context?.minutes || previous?.minutes || "",
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    reachedStep: Math.max(previous?.reachedStep || 0, reachedStep || 0),
    revision: (previous?.revision || 0) + 1,
  });
}

const legacyInquiryDirections = new Set([
  "唐朝前期为什么被称为盛世，这个说法对不同群体都成立吗？",
  "依据哪些史料，我们可以把唐朝前期称为“盛世”？",
  "唐朝为何由盛转衰",
]);

export const loadContextDraft = async (taskRef: string) => {
  if (isLocalMode) return (await import("./local-task-store")).loadLocalDraft(taskRef, "context");
  const draft = await loadDraft<TeachingContextDraft>(CONTEXT_STORE, taskRef);
  if (!draft || !legacyInquiryDirections.has(draft.inquiryQuestion)) return draft;
  const migrated = { ...draft, inquiryQuestion: "唐朝由盛转衰的原因" };
  await saveDraft(CONTEXT_STORE, taskRef, migrated);
  return migrated;
};
export const saveContextDraft = async (taskRef: string, draft: TeachingContextDraft) => {
  if (isLocalMode) return (await import("./local-task-store")).saveLocalContext(taskRef, draft);
  await saveDraft(CONTEXT_STORE, taskRef, draft);
  if (draft.textbook.trim() && draft.lesson.trim() && draft.grade && draft.minutes) await touchTask(taskRef, draft);
};
const legacyCentralQuestions = new Set([
  "依据政治运行、经济发展与社会生活等不同类型的史料，“盛世”能在多大程度上概括唐朝前期？",
  "依据不同类型的史料，‘盛世’能在多大程度上概括唐朝前期？",
  "唐朝的盛世局面为何未能持续，并最终走向衰亡？",
]);
const legacySubQuestions = new Set([
  "唐朝盛世局面依靠哪些条件建立和维持？",
  "哪些变化破坏了这些条件，安史之乱为何构成重要转折？",
  "安史之乱后唐朝为何还能延续，却始终未恢复盛世并最终灭亡？",
]);
const currentSubQuestions = [
  "唐朝前期的盛世局面建立在怎样的政治、经济与社会条件上？",
  "安史之乱为什么成为唐朝由盛转衰的关键转折？",
  "安史之乱后，哪些长期问题使唐朝难以恢复并最终灭亡？",
];

export const loadQuestionDraft = async (taskRef: string) => {
  if (isLocalMode) return (await import("./local-task-store")).loadLocalDraft(taskRef, "question");
  const draft = await loadDraft<QuestionWorkspaceDraft>(QUESTION_STORE, taskRef);
  if (!draft) return undefined;
  const centralChanged = legacyCentralQuestions.has(draft.centralQuestion);
  const subQuestionsChanged = draft.subQuestions.some((question) => legacySubQuestions.has(question));
  if (!centralChanged && !subQuestionsChanged) return draft;
  const migrated = { ...draft, centralQuestion: centralChanged ? "唐朝为何由盛转衰？" : draft.centralQuestion, subQuestions: subQuestionsChanged ? currentSubQuestions : draft.subQuestions, confirmed: false };
  await saveDraft(QUESTION_STORE, taskRef, migrated);
  return migrated;
};
export const saveQuestionDraft = (taskRef: string, draft: QuestionWorkspaceDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalQuestion(taskRef, draft)) : saveDraft(QUESTION_STORE, taskRef, draft);
export const loadSourceDraft = (taskRef: string) => isLocalMode ? import("./local-task-store").then(module => module.loadLocalDraft(taskRef, "source")) : loadDraft<SourceDiscoveryDraft>(SOURCE_STORE, taskRef);
export const saveSourceDraft = (taskRef: string, draft: SourceDiscoveryDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalSources(taskRef, draft)) : saveDraft(SOURCE_STORE, taskRef, draft);
export const loadEvidenceDraft = (taskRef: string) => isLocalMode ? import("./local-task-store").then(module => module.loadLocalDraft(taskRef, "evidence")) : loadDraft<EvidenceMapDraft>(EVIDENCE_STORE, taskRef);
export const saveEvidenceDraft = (taskRef: string, draft: EvidenceMapDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalEvidence(taskRef, draft)) : saveDraft(EVIDENCE_STORE, taskRef, draft);
export const loadLessonDraft = (taskRef: string) => isLocalMode ? import("./local-task-store").then(module => module.loadLocalDraft(taskRef, "lesson")) : loadDraft<LessonDesignDraft>(LESSON_STORE, taskRef);
export const saveLessonDraft = (taskRef: string, draft: LessonDesignDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalLesson(taskRef, draft)) : saveDraft(LESSON_STORE, taskRef, draft);
export const loadRubricDraft = (taskRef: string) => isLocalMode ? import("./local-task-store").then(module => module.loadLocalDraft(taskRef, "rubric")) : loadDraft<RubricDraft>(RUBRIC_STORE, taskRef);
export const saveRubricDraft = (taskRef: string, draft: RubricDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalRubric(taskRef, draft)) : saveDraft(RUBRIC_STORE, taskRef, draft);
export const loadAuditDraft = (taskRef: string) => isLocalMode ? import("./local-task-store").then(module => module.loadLocalDraft(taskRef, "audit")) : loadDraft<AuditDraft>(AUDIT_STORE, taskRef);
export const saveAuditDraft = (taskRef: string, draft: AuditDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalAudit(taskRef, draft)) : saveDraft(AUDIT_STORE, taskRef, draft);
export const loadFinalReviewDraft = (taskRef: string) => isLocalMode ? import("./local-task-store").then(module => module.loadLocalDraft(taskRef, "review")) : loadDraft<FinalReviewDraft>(FINAL_REVIEW_STORE, taskRef);
export const saveFinalReviewDraft = (taskRef: string, draft: FinalReviewDraft) => isLocalMode ? import("./local-task-store").then(module => module.saveLocalReview(taskRef, draft)) : saveDraft(FINAL_REVIEW_STORE, taskRef, draft);

export async function markTaskReached(taskRef: string, reachedStep: number) {
  if (isLocalMode) return;
  await touchTask(taskRef, undefined, reachedStep);
}

export async function listTasks() {
  if (isLocalMode) return (await import("./local-task-store")).listLocalTasks();
  const database = await openDatabase();
  return new Promise<TaskSummary[]>((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE);
    const request = transaction.objectStore(TASK_STORE).getAll();
    request.onsuccess = () => resolve([...(request.result as TaskSummary[])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error ?? new Error("task-list-failed"));
    transaction.oncomplete = () => database.close();
  });
}

export async function prepareNewTask(taskRef: string, fallback: TeachingContextDraft) {
  if (isLocalMode) return (await import("./local-task-store")).createLocalTask(taskRef);
  const [latest] = await listTasks();
  const previous = latest ? await loadContextDraft(latest.id) : undefined;
  const source = previous || fallback;
  await saveDraft(CONTEXT_STORE, taskRef, {
    ...source,
    lesson: "",
    inquiryQuestion: "",
    lessonTypes: [...source.lessonTypes],
    learningNeeds: [...source.learningNeeds],
    profileNote: "",
  } satisfies TeachingContextDraft);
}

export async function deleteTask(taskRef: string): Promise<TaskBackup | undefined> {
  if (isLocalMode) return (await import("./local-task-store")).deleteLocalTask(taskRef);
  const task = await readTask(taskRef);
  if (!task) return undefined;
  const database = await openDatabase();
  const drafts: Record<string, unknown> = {};
  await Promise.all(draftStores.map((store) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store);
    const request = transaction.objectStore(store).get(taskRef);
    request.onsuccess = () => { drafts[store] = request.result; resolve(); };
    request.onerror = () => reject(request.error);
  })));
  database.close();
  const writable = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = writable.transaction([TASK_STORE, ...draftStores], "readwrite");
    transaction.objectStore(TASK_STORE).delete(taskRef);
    draftStores.forEach((store) => transaction.objectStore(store).delete(taskRef));
    transaction.oncomplete = () => { writable.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
  taskChannel?.postMessage({ taskId: taskRef, deleted: true, sourceId: clientId });
  return { task, drafts };
}

export async function restoreTask(backup: TaskBackup) {
  if (isLocalMode) return (await import("./local-task-store")).restoreLocalTask(backup);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([TASK_STORE, ...draftStores], "readwrite");
    transaction.objectStore(TASK_STORE).put({ ...backup.task, updatedAt: new Date().toISOString(), revision: backup.task.revision + 1 });
    draftStores.forEach((store) => {
      if (backup.drafts[store] !== undefined) transaction.objectStore(store).put(backup.drafts[store], backup.task.id);
    });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function duplicateTask(taskRef: string, nextId: string) {
  if (isLocalMode) return (await import("./local-task-store")).copyLocalTask(taskRef, nextId);
  const task = await readTask(taskRef);
  if (!task) return;
  const database = await openDatabase();
  const values = await Promise.all(draftStores.map((store) => new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(store);
    const request = transaction.objectStore(store).get(taskRef);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  })));
  database.close();
  const writable = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const now = new Date().toISOString();
    const transaction = writable.transaction([TASK_STORE, ...draftStores], "readwrite");
    transaction.objectStore(TASK_STORE).put({ ...task, id: nextId, title: `${task.title}（副本）`, createdAt: now, updatedAt: now, revision: 1 });
    draftStores.forEach((store, index) => { if (values[index] !== undefined) transaction.objectStore(store).put(values[index], nextId); });
    transaction.oncomplete = () => { writable.close(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

export function subscribeTaskChanges(taskRef: string, listener: () => void) {
  if (!taskChannel) return () => undefined;
  const onMessage = (event: MessageEvent<{ taskId?: string; sourceId?: string }>) => {
    if (event.data.taskId === taskRef && event.data.sourceId !== clientId) listener();
  };
  taskChannel.addEventListener("message", onMessage);
  return () => taskChannel.removeEventListener("message", onMessage);
}
