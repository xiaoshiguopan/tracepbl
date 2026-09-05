import { z } from "zod";

export const ContractVersion = "1.1.0";
export const UuidSchema = z.uuid();
export const TimestampSchema = z.iso.datetime({ offset: true });

export const ProblemCodeSchema = z.enum([
  "MALFORMED_REQUEST", "SESSION_REQUIRED", "RESOURCE_NOT_FOUND", "INVALID_STATE",
  "IDEMPOTENCY_KEY_REUSED", "PURGE_ALREADY_STARTED", "VERSION_CONFLICT",
  "PRECONDITION_REQUIRED", "INPUT_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE",
  "VALIDATION_FAILED", "CITATION_GATE_FAILED", "BUDGET_EXCEEDED", "RATE_LIMITED",
  "AI_NOT_CONFIGURED", "PROVIDER_UNAVAILABLE", "INTERNAL_ERROR",
]);
export type ProblemCode = z.infer<typeof ProblemCodeSchema>;

export const ProblemSchema = z.object({
  type: z.string().startsWith("https://tracepbl.local/problems/"),
  title: z.string().min(1).max(100),
  status: z.int().min(400).max(599),
  code: ProblemCodeSchema,
  detail: z.string().min(1).max(300),
  traceId: UuidSchema,
}).strict();
export type Problem = z.infer<typeof ProblemSchema>;

export const OperationStatusSchema = z.object({
  id: UuidSchema,
  kind: z.enum(["sourceCheck", "embedding", "model", "audit", "export", "purge"]),
  status: z.enum(["queued", "running", "partial", "succeeded", "failed", "cancelled"]),
  phase: z.enum(["processing", "waitingForTeacher"]).optional(),
  completedItems: z.int().nonnegative().optional(),
  totalItems: z.int().nonnegative().optional(),
  attempt: z.int().nonnegative(),
  canCancel: z.boolean(),
  startedAt: TimestampSchema.nullable(),
  updatedAt: TimestampSchema,
  error: z.object({ code: z.string().max(80), message: z.string().max(300) }).strict().optional(),
  result: z.object({ href: z.string().startsWith("/api/v1/") }).strict().optional(),
}).strict();
export type OperationStatus = z.infer<typeof OperationStatusSchema>;

export const JobEventTypeSchema = z.enum([
  "operation.queued", "operation.running", "operation.progress", "operation.paused",
  "operation.succeeded", "operation.failed", "operation.cancelled", "operation.stale",
  "task.deleted", "stream.reset",
]);
export const JobEventSchema = z.object({
  id: z.string().regex(/^\d+$/),
  schemaVersion: z.literal(1),
  type: JobEventTypeSchema,
  operationId: UuidSchema.optional(),
  kind: OperationStatusSchema.shape.kind.optional(),
  completedItems: z.int().nonnegative().optional(),
  totalItems: z.int().nonnegative().optional(),
  attempt: z.int().nonnegative().optional(),
  canCancel: z.boolean().optional(),
  errorCode: z.string().max(80).optional(),
  resultHref: z.string().startsWith("/api/v1/").optional(),
  occurredAt: TimestampSchema,
}).strict();
export type JobEvent = z.infer<typeof JobEventSchema>;

export const TaskSummarySchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(120),
  workflowState: z.enum(["draft", "in_progress", "approved"]),
  lockVersion: z.int().nonnegative(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();
export const TaskSchema = TaskSummarySchema.extend({ deletedAt: TimestampSchema.nullable() }).strict();
export const ReviewStatesSchema = z.object({ questionSet: z.enum(["ready", "needs_review"]), sourceSelection: z.enum(["ready", "needs_review"]), evidenceMap: z.enum(["ready", "needs_review"]), lessonDesign: z.enum(["ready", "needs_review"]), rubric: z.enum(["ready", "needs_review"]) }).strict();
export const TaskDetailSchema = TaskSchema.extend({ latestTeacherRevisionId: UuidSchema.nullable(), latestApprovedRevisionId: UuidSchema.nullable(), latestAuditId: UuidSchema.nullable(), reviewStates: ReviewStatesSchema }).strict();
export const OperationListSchema = z.object({ items: z.array(OperationStatusSchema), nextCursor: z.string().max(500).nullable() }).strict();
export const DeletionWindowSchema = z.object({ deletedAt: TimestampSchema, purgeAfter: TimestampSchema, lockVersion: z.int().nonnegative() }).strict();
export const TaskListSchema = z.object({ items: z.array(TaskSummarySchema), nextCursor: z.string().max(500).nullable() }).strict();

export const CreateTaskSchema = z.object({ title: z.string().trim().min(1).max(120) }).strict();
export const CopyTaskSchema=z.object({title:z.string().trim().min(1).max(120).optional()}).strict();
export const TeachingContextSchema = z.object({
  stage: z.enum(["初中", "高中"]),
  grade: z.enum(["七年级", "八年级", "九年级", "高一", "高二", "高三"]),
  textbook: z.string().trim().min(1).max(160),
  lesson: z.string().trim().min(1).max(120),
  lessonTypes: z.array(z.enum(["新授", "复习", "公开课 / 比赛", "微型 PBL"])).max(4),
  minutes: z.int().min(1).max(180),
  inquiryDirection: z.string().trim().max(160).nullable(),
  priorKnowledge: z.string().trim().max(1000).nullable(),
  learningNeeds: z.array(z.string().trim().min(1).max(160)).max(10),
  profileNote: z.string().trim().max(240).nullable(),
}).strict().superRefine((value, context) => {
  const valid = value.stage === "初中" ? ["七年级", "八年级", "九年级"] : ["高一", "高二", "高三"];
  if (!valid.includes(value.grade)) context.addIssue({ code: "custom", path: ["grade"], message: "年级与学段不一致" });
});

export const QuestionSetSchema = z.object({
  centralQuestion: z.string().trim().min(1).max(300),
  subQuestions: z.array(z.string().trim().min(1).max(300)).max(4),
  focus: z.enum(["single", "whole-lesson"]).optional(),
  inputType: z.enum(["因果解释", "变化解释", "证据支持", "史料比较"]).nullable().optional(),
  evidenceOutcome: z.string().trim().min(1).max(1000).optional(),
  scopeBoundary: z.string().trim().min(1).max(1000).optional(),
  confirmed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.focus === "single" && value.subQuestions.length !== 0) context.addIssue({ code: "custom", path: ["subQuestions"], message: "单问题不拆分子问题" });
  if (value.focus === "whole-lesson" && value.subQuestions.length < 2) context.addIssue({ code: "custom", path: ["subQuestions"], message: "整课线索需要 2—4 个子问题" });
});

export const MaterialInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), name: z.string().trim().min(1).max(160), url: z.url().max(2048), rightsAttestation: z.enum(["authorizedForCurrentTask", "unknown"]), sensitiveInformationConfirmedAbsent: z.literal(true) }).strict(),
  z.object({ kind: z.literal("text"), name: z.string().trim().min(1).max(160), text: z.string().min(1).max(50_000), rightsAttestation: z.enum(["authorizedForCurrentTask", "unknown"]), sensitiveInformationConfirmedAbsent: z.literal(true) }).strict(),
]);

export const ProposalPurposeSchema = z.enum(["questionGuidance", "sourceAnalysis", "evidenceAnalysis", "lesson", "rubric", "audit"]);
export const ProposalRequestSchema = z.object({ purpose: ProposalPurposeSchema, baseLockVersion: z.int().nonnegative(), disclosureVersion: z.literal("ai-disclosure.v1"), objectIds: z.array(UuidSchema).max(50).optional() }).strict();
export const AdoptionRequestSchema = z.object({ generatedRevisionId: UuidSchema, sections: z.array(z.enum(["questionSet", "evidenceMap", "lessonDesign", "rubric"])).min(1).max(4), baseLockVersion: z.int().nonnegative(), reviewedContent: z.record(z.string(), z.unknown()).optional() }).strict();
export const DecisionRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["acceptRisk", "requestChanges"]), findingId: UuidSchema, reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ kind: z.enum(["approve", "revoke"]), taskRevisionId: UuidSchema, reason: z.string().trim().max(1000).optional() }).strict(),
]);
export const ExportRequestSchema = z.object({ format: z.enum(["docx", "pdf"]), fileName: z.string().trim().min(1).max(120) }).strict();
export const AuditRequestSchema=z.object({baseLockVersion:z.int().nonnegative()}).strict();
export const VerificationFindingSchema=z.object({subjectKind:z.string(),subjectId:UuidSchema.nullable(),id:UuidSchema,severity:z.enum(["blocking","teacher_confirmation","suggestion","pass","unknown"]),category:z.string(),title:z.string(),basis:z.string(),impact:z.string(),recommendation:z.string().nullable(),teacherReason:z.string().nullable(),resolutionState:z.enum(["pending","accepted","resolved","superseded"])}).strict();
export const AuditViewSchema=z.object({id:UuidSchema,inputLockVersion:z.int().nonnegative(),status:z.enum(["queued","running","succeeded","failed","cancelled","stale"]),summary:z.record(z.string(),z.unknown()).nullable(),createdAt:TimestampSchema,completedAt:TimestampSchema.nullable(),findings:z.array(VerificationFindingSchema)}).strict();
export const AuditOperationSchema=z.object({runId:UuidSchema,reused:z.boolean(),operation:OperationStatusSchema}).strict();
export const DecisionResultSchema=z.object({decisionId:UuidSchema,kind:z.enum(["acceptRisk","requestChanges","approve","revoke"]),revisionId:UuidSchema.nullable(),lockVersion:z.int().nonnegative()}).strict();
export const ExportOperationSchema=z.object({exportId:UuidSchema,operation:OperationStatusSchema}).strict();

export const SourceViewSchema = z.object({ periodLabel: z.string().nullable(), contextNote: z.string().nullable(), meaningNote: z.string().nullable(), interpretationNote: z.string().nullable(), limitationNote: z.string().nullable(), rightsBasis: z.string(), id: UuidSchema, versionId: UuidSchema, title: z.string(), kind: z.enum(["catalog", "url", "text"]), url: z.url().nullable(), creatorOrInstitution: z.string(), sourceType: z.string(), locator: z.string(), contentText: z.string().nullable(), rightsState: z.enum(["verified_reusable", "restricted_metadata_only", "unknown", "not_allowed"]), verificationState: z.enum(["candidate", "pending", "verified", "conditional", "excluded"]), selected: z.boolean(), selectionOrder: z.int().nonnegative().nullable() }).strict();
export const SourceListSchema = z.object({ items: z.array(SourceViewSchema) }).strict();
export const SourceSelectionSchema = z.object({ sourceVersionIds: z.array(UuidSchema).max(100) }).strict();
export const MaterialResultSchema = z.object({ sourceId: UuidSchema, versionId: UuidSchema, operation: OperationStatusSchema.nullable() }).strict();

export const CitationInputSchema = z.object({ sourceVersionId: UuidSchema, chunkId: z.int().positive().nullable(), quotedText: z.string().max(2000).nullable() }).strict().superRefine((value, context) => {
  if ((value.chunkId === null) !== (value.quotedText === null)) context.addIssue({ code: "custom", message: "chunkId 与 quotedText 必须同时提供或同时为空" });
});
export const EvidenceRelationInputSchema = z.object({ sourceVersionId: UuidSchema, kind: z.enum(["background", "supports", "turning_point", "consequence", "challenges_or_limits"]), reason: z.string().min(1).max(2000), citations: z.array(CitationInputSchema).max(10) }).strict();
export const EvidenceClaimInputSchema = z.object({ text: z.string().min(1).max(2000), gapAccepted: z.boolean(), relations: z.array(EvidenceRelationInputSchema).max(20) }).strict();
export const EvidenceMapSchema = z.object({ claims: z.array(EvidenceClaimInputSchema).max(30) }).strict();

export const LessonActivityInputSchema = z.object({ title: z.string().min(1).max(300), activityMinutes: z.int().nonnegative().max(180), transitionMinutes: z.int().nonnegative().max(60), studentAction: z.string().min(1).max(3000), evidenceProduct: z.string().min(1).max(2000), difficulty: z.string().max(2000), scaffold: z.string().max(2000), sourceVersionIds: z.array(UuidSchema).max(30) }).strict();
export const LessonDesignSchema = z.object({ activities: z.array(LessonActivityInputSchema).max(20) }).strict();
export const RubricLevelInputSchema = z.object({ key: z.enum(["support", "expected", "strong"]), label: z.string().min(1).max(80), description: z.string().min(1).max(2000) }).strict();
export const RubricItemInputSchema = z.object({ title: z.string().min(1).max(300), activityOrdinals: z.array(z.int().nonnegative()).max(20), levels: z.array(RubricLevelInputSchema).length(3) }).strict();
export const RubricSchema = z.object({ items: z.array(RubricItemInputSchema).max(20) }).strict();

export const AsyncOperationSchema = z.object({ operation: OperationStatusSchema }).strict();
export const GeneratedProposalSchema = z.object({ revisionId: UuidSchema, purpose: ProposalPurposeSchema, baseLockVersion: z.int().nonnegative(), status: z.literal("validated"), snapshot: z.record(z.string(), z.unknown()) }).strict();
export const ExportContentSchema = z.object({ context: TeachingContextSchema, questionSet: QuestionSetSchema, evidenceMap: EvidenceMapSchema, lessonDesign: LessonDesignSchema, rubric: RubricSchema, sources: z.array(SourceViewSchema) }).strict();
export const ExportManifestSchema = z.object({ content: ExportContentSchema, exportId: UuidSchema, format: z.enum(["docx", "pdf"]), fileName: z.string(), revisionId: UuidSchema, generatedAt: TimestampSchema, sections: z.array(z.string()), citations: z.array(z.object({ title: z.string(), locator: z.string(), url: z.url().nullable() }).strict()) }).strict();

export const RuntimeSchema = z.object({
  mode: z.enum(["local", "ci"]), contractVersion: z.literal(ContractVersion), fixtureVersion: z.string().min(1),
  ai: z.object({ execution: z.enum(["disabled", "fake", "real"]), available: z.boolean(), provider: z.literal("zhipu"), generationModel: z.literal("GLM-5.3-Flash"), embeddingModel: z.literal("embedding-3"), reason: z.string().max(120).nullable() }).strict(),
  limits: z.object({ generationInputTokens: z.literal(24_000), generationOutputTokens: z.literal(4_000), callsPerAction: z.literal(2), dailyGenerationCalls: z.literal(20), dailyGenerationTokens: z.literal(200_000), dailyEmbeddingTokens: z.literal(200_000), dailyCny: z.literal(2), deleteGraceHours: z.literal(24) }).strict(),
}).strict();

export const IdempotencyKeySchema = z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
export const TaskEtagSchema = z.string().regex(/^"task-lv-(0|[1-9]\d*)"$/);
export function taskEtag(lockVersion: number) { return `"task-lv-${lockVersion}"` as const; }
export function parseTaskEtag(value: string | undefined) {
  const parsed = value ? TaskEtagSchema.safeParse(value) : undefined;
  if (!parsed?.success) return null;
  return Number(parsed.data.slice(9, -1));
}
