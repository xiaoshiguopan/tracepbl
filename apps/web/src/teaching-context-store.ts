import type { TeachingContextDraft } from "./teaching-context";

const DB_NAME = "tracepbl-demo";
const STORE_NAME = "teaching-context-drafts";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("local-storage-open-failed"));
  });
}

export async function loadContextDraft(taskRef: string) {
  const database = await openDatabase();
  return new Promise<TeachingContextDraft | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME);
    const request = transaction.objectStore(STORE_NAME).get(taskRef);
    request.onsuccess = () => resolve(request.result as TeachingContextDraft | undefined);
    request.onerror = () => reject(request.error ?? new Error("local-draft-read-failed"));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveContextDraft(taskRef: string, draft: TeachingContextDraft) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft, taskRef);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("local-draft-write-failed"));
  });
}
