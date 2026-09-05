import { EvidenceMapSchema, LessonDesignSchema, QuestionSetSchema, RubricSchema } from "@tracepbl/contracts";
import { localViewModel, relationKeys } from "./local-view-model";
import type { LocalTaskData } from "./local-task-data";
import type { ProposalPurpose } from "./local-operations";
import type { QuestionWorkspaceDraft } from "./question-workspace";
import type { EvidenceMapDraft } from "./evidence-map";
import type { LessonDesignDraft } from "./lesson-design";
import type { RubricDraft } from "./rubric-design";

export type InlineDraft = QuestionWorkspaceDraft | EvidenceMapDraft | LessonDesignDraft | RubricDraft;
export type InlineTarget = { id: string; label: string };
export function generatedInlineDraft(purpose: ProposalPurpose, value: unknown, data: LocalTaskData): InlineDraft {
  // A fresh candidate is editable; InlineAi separately tracks that it is not teacher-confirmed.
  const section = ({questionGuidance:"questionSet",evidenceAnalysis:"evidenceMap",lesson:"lessonDesign",rubric:"rubric"} as const)[purpose];
  data = { ...data, task: { ...data.task, reviewStates: { ...data.task.reviewStates, [section]: "ready" } } };
  if (purpose === "questionGuidance") return localViewModel({ ...data, question: QuestionSetSchema.parse(value) }).question;
  if (purpose === "evidenceAnalysis") return localViewModel({ ...data, evidence: EvidenceMapSchema.parse(value) }).evidence;
  if (purpose === "lesson") return localViewModel({ ...data, lesson: LessonDesignSchema.parse(value) }).lesson;
  return localViewModel({ ...data, rubric: RubricSchema.parse(value) }).rubric;
}

/** Replace only the chosen scope. Used in reverse for undo, preserving unrelated edits. */
export function mergeInlineDraft<T extends InlineDraft>(purpose: ProposalPurpose, current: T, generated: T, target: string): T {
  if (purpose === "questionGuidance") {
    const before = current as QuestionWorkspaceDraft; const next = generated as QuestionWorkspaceDraft;
    const fields = target === "all" ? { centralQuestion: next.centralQuestion, subQuestions: next.subQuestions, evidenceOutcome: next.evidenceOutcome, scopeBoundary: next.scopeBoundary, focus: next.focus, inputType: next.inputType } : target === "subQuestions" ? { subQuestions: next.subQuestions, focus: next.subQuestions.length ? "whole-lesson" as const : "single" as const } : target === "centralQuestion" ? { centralQuestion: next.centralQuestion } : { evidenceOutcome: next.evidenceOutcome };
    return { ...before, ...fields, confirmed: false } as T;
  }
  if (purpose === "evidenceAnalysis") {
    const before = current as EvidenceMapDraft; const next = generated as EvidenceMapDraft;
    const claims = before.claims.length ? before.claims : next.claims;
    const replacements = claims.flatMap((claim, index) => target !== "all" && claim.id !== target ? [] : next.relations.filter(relation => relation.claimId === next.claims[index]?.id).map((relation, ordinal) => ({ ...relation, id: `AI-${claim.id}-${ordinal}`, claimId: claim.id })));
    return { ...before, claims, relations: [...before.relations.filter(relation => target !== "all" && relation.claimId !== target), ...replacements], confirmed: false } as T;
  }
  if (purpose === "lesson") {
    const before = current as LessonDesignDraft; const next = generated as LessonDesignDraft;
    return { ...before, activities: target === "all" ? next.activities : before.activities.map((activity, index) => activity.id !== target || !next.activities.length ? activity : { ...next.activities[index % next.activities.length], id: activity.id, minutes: activity.minutes, transitionMinutes: activity.transitionMinutes }), confirmed: false } as T;
  }
  const before = current as RubricDraft; const next = generated as RubricDraft;
  return { ...before, dimensions: target === "all" ? next.dimensions : before.dimensions.map((dimension, index) => dimension.id !== target || !next.dimensions.length ? dimension : { ...next.dimensions[index % next.dimensions.length], id: dimension.id, activityIds: dimension.activityIds }), confirmed: false } as T;
}

export function inlineScope(purpose: ProposalPurpose, draft: InlineDraft, target: string): unknown {
  if (target === "all") return draft;
  if (purpose === "questionGuidance") return (draft as unknown as Record<string, unknown>)[target];
  if (purpose === "evidenceAnalysis") { const value = draft as EvidenceMapDraft; return { claim: value.claims.find(item => item.id === target), relations: value.relations.filter(item => item.claimId === target) }; }
  if (purpose === "lesson") return (draft as LessonDesignDraft).activities.find(item => item.id === target);
  return (draft as RubricDraft).dimensions.find(item => item.id === target);
}

export function restoreInlineDraft<T extends InlineDraft>(purpose: ProposalPurpose, current: T, before: T, target: string): T {
  if (target === "all") return { ...before, confirmed: false };
  if (purpose === "evidenceAnalysis") {
    const value = current as EvidenceMapDraft; const old = before as EvidenceMapDraft;
    return { ...value, relations: [...value.relations.filter(item => item.claimId !== target), ...old.relations.filter(item => item.claimId === target)], confirmed: false } as T;
  }
  if (purpose === "lesson") return { ...current, activities: (current as LessonDesignDraft).activities.map(item => item.id === target ? (before as LessonDesignDraft).activities.find(old => old.id === target) ?? item : item), confirmed: false } as T;
  if (purpose === "rubric") return { ...current, dimensions: (current as RubricDraft).dimensions.map(item => item.id === target ? (before as RubricDraft).dimensions.find(old => old.id === target) ?? item : item), confirmed: false } as T;
  return mergeInlineDraft(purpose, current, before, target);
}

export function reviewedInlineContent(purpose: ProposalPurpose, draft: InlineDraft, data: LocalTaskData, generated: unknown): Record<string, unknown> {
  if (purpose === "questionGuidance") { const value = draft as QuestionWorkspaceDraft; return QuestionSetSchema.parse({ centralQuestion: value.centralQuestion, subQuestions: value.subQuestions, focus: value.focus, inputType: value.inputType || null, evidenceOutcome: value.evidenceOutcome || undefined, scopeBoundary: value.scopeBoundary || undefined, confirmed: true }); }
  if (purpose === "lesson") return LessonDesignSchema.parse({ activities: (draft as LessonDesignDraft).activities.map(item => ({ title: item.title, activityMinutes: item.minutes, transitionMinutes: item.transitionMinutes, sourceVersionIds: item.sourceIds, studentAction: item.studentAction, evidenceProduct: item.evidenceProduct, difficulty: item.difficulty, scaffold: item.scaffold })) });
  if (purpose === "rubric") return RubricSchema.parse({ items: (draft as RubricDraft).dimensions.map(item => ({ title: item.title, levels: item.levels, activityOrdinals: item.activityIds.map(id => localViewModel(data).lesson.activities.findIndex(activity => activity.id === id)) })) });
  const proposal = EvidenceMapSchema.parse(generated);
  const known = [...proposal.claims, ...data.evidence.claims];
  const value = draft as EvidenceMapDraft;
  return EvidenceMapSchema.parse({ claims: value.claims.map(claim => ({ text: claim.text, gapAccepted: claim.gapAccepted, relations: value.relations.filter(relation => relation.claimId === claim.id).map(relation => {
    const original = known.flatMap(item => item.relations).find(item => item.sourceVersionId === relation.sourceId && item.kind === relationKeys[relation.kind] && item.reason === relation.reason);
    return { sourceVersionId: relation.sourceId, kind: relationKeys[relation.kind], reason: relation.reason, citations: relation.citations ?? original?.citations ?? [{ sourceVersionId: relation.sourceId, chunkId: null, quotedText: null }] };
  }) })) });
}
