import type { AuditDraft } from "./design-audit";
import type { LessonDesignDraft } from "./lesson-design";
import type { RubricDraft } from "./rubric-design";

export type FinalReviewInput = {
  question: string;
  selectedSourceIds: string[];
  lesson: LessonDesignDraft;
  rubric: RubricDraft;
  audit: AuditDraft;
};

export type FinalReviewDraft = {
  fixtureVersion: 2;
  approved: boolean;
  confirmedAt: string | null;
  inputSnapshot: string;
  fileName: string;
};

const invalidFileName = /[<>:"/\\|?*\u0000-\u001f]/g;

export function makeFinalReviewSnapshot(input: FinalReviewInput) {
  return JSON.stringify([
    input.question,
    input.selectedSourceIds,
    input.lesson.activities,
    input.rubric.dimensions,
    input.audit.completed,
    input.audit.categorySnapshots,
    input.audit.staleCategories,
  ]);
}

export function sanitizeTeachingPackFileName(value: string) {
  return value.replace(invalidFileName, "-").replace(/\s+/g, " ").replace(/-+/g, "-").trim().slice(0, 80);
}

export function createFinalReviewDraft(input: FinalReviewInput): FinalReviewDraft {
  return {
    fixtureVersion: 2,
    approved: false,
    confirmedAt: null,
    inputSnapshot: makeFinalReviewSnapshot(input),
    fileName: "史证工坊-唐朝由盛转衰",
  };
}

export function normalizeFinalReviewDraft(draft: FinalReviewDraft, input: FinalReviewInput): FinalReviewDraft {
  if (draft.fixtureVersion !== 2) return createFinalReviewDraft(input);
  const inputSnapshot = makeFinalReviewSnapshot(input);
  return inputSnapshot === draft.inputSnapshot ? draft : { ...draft, approved: false, confirmedAt: null, inputSnapshot };
}

export function getFinalReviewSummary(input: FinalReviewInput, draft: FinalReviewDraft) {
  const fileName = sanitizeTeachingPackFileName(draft.fileName);
  const fileNameMeaningful = Boolean(fileName.replace(/[-.\s]/g, ""));
  const snapshotCurrent = draft.inputSnapshot === makeFinalReviewSnapshot(input);
  const upstreamReady = Boolean(
    input.question.trim()
    && input.selectedSourceIds.length >= 4
    && input.lesson.activities.length
    && input.rubric.dimensions.length
    && input.audit.completed
    && snapshotCurrent,
  );
  return {
    upstreamReady,
    fileName,
    fileNameError: fileNameMeaningful ? "" : "请保留至少一个可用于文件名的字符。",
    canExport: upstreamReady && draft.approved && fileNameMeaningful,
  };
}

export function confirmTeachingPack(draft: FinalReviewDraft, input: FinalReviewInput, confirmedAt = new Date().toISOString()): FinalReviewDraft {
  return { ...draft, approved: true, confirmedAt, inputSnapshot: makeFinalReviewSnapshot(input) };
}
