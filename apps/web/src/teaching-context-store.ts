import type { TeachingContextDraft } from "./teaching-context";
import type { QuestionWorkspaceDraft } from "./question-workspace";

const DB_NAME = "tracepbl-demo";
const CONTEXT_STORE = "teaching-context-drafts";
const QUESTION_STORE = "question-workspace-drafts";
const DB_VERSION = 2;

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

export const loadContextDraft = (taskRef: string) => loadDraft<TeachingContextDraft>(CONTEXT_STORE, taskRef);
export const saveContextDraft = (taskRef: string, draft: TeachingContextDraft) => saveDraft(CONTEXT_STORE, taskRef, draft);
export const loadQuestionDraft = (taskRef: string) => loadDraft<QuestionWorkspaceDraft>(QUESTION_STORE, taskRef);
export const saveQuestionDraft = (taskRef: string, draft: QuestionWorkspaceDraft) => saveDraft(QUESTION_STORE, taskRef, draft);
