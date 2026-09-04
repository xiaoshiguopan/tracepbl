import {
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const core = pgSchema("core");
const rag = pgSchema("rag");
const ops = pgSchema("ops");
const vector1024 = customType<{ data: number[]; driverData: string }>({
  dataType: () => "vector(1024)",
});
const uuidV7PrimaryKey = () => uuid().primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const workspaces = core.table("workspaces", {
  id: uuidV7PrimaryKey(), mode: text().notNull().default("local_single_user"),
  displayName: text("display_name").notNull().default("本地工作区"), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const tasks = core.table("tasks", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), title: text().notNull(),
  workflowState: text("workflow_state").notNull().default("draft"), lockVersion: bigint("lock_version", { mode: "number" }).notNull().default(0),
  revisionSeq: bigint("revision_seq", { mode: "number" }).notNull().default(0), lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), purgeAfter: timestamp("purge_after", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.id)]);

export const taskContexts = core.table("task_contexts", {
  taskId: uuid("task_id").primaryKey(), workspaceId: uuid("workspace_id").notNull(), stage: text().notNull(), grade: text().notNull(),
  textbook: text().notNull(), lesson: text().notNull(), lessonTypes: text("lesson_types").array().notNull().default([]), minutes: integer().notNull(),
  inquiryDirection: text("inquiry_direction"), priorKnowledge: text("prior_knowledge"), learningNeeds: text("learning_needs").array().notNull().default([]),
  profileNote: text("profile_note"), updatedAt: updatedAt(),
});

export const inquiryQuestions = core.table("inquiry_questions", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), parentId: uuid("parent_id"),
  kind: text().notNull(), ordinal: integer().notNull(), questionText: text("question_text").notNull(), inputType: text("input_type"),
  evidenceOutcome: text("evidence_outcome"), scopeBoundary: text("scope_boundary"), confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  reviewState: text("review_state").notNull().default("ready"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.taskId, table.kind, table.ordinal)]);

export const sources = core.table("sources", {
  id: uuidV7PrimaryKey(), scope: text().notNull(), workspaceId: uuid("workspace_id"), taskId: uuid("task_id"), materialKind: text("material_kind").notNull(),
  title: text().notNull(), canonicalUrl: text("canonical_url"), dataClass: text("data_class").notNull(), retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id)]);

export const sourceVersions = core.table("source_versions", {
  id: uuidV7PrimaryKey(), sourceId: uuid("source_id").notNull(), versionNo: bigint("version_no", { mode: "number" }).notNull(),
  creatorOrInstitution: text("creator_or_institution").notNull(), periodLabel: text("period_label"), sourceType: text("source_type").notNull(), identifier: text(),
  locator: text().notNull(), accessedAt: timestamp("accessed_at", { withTimezone: true }), languageCode: text("language_code").notNull().default("zh-CN"),
  contentText: text("content_text"), contextNote: text("context_note"), meaningNote: text("meaning_note"), interpretationNote: text("interpretation_note"),
  limitationNote: text("limitation_note"), rightsState: text("rights_state").notNull(), rightsBasis: text("rights_basis").notNull(),
  verificationState: text("verification_state").notNull(), contentHash: text("content_hash").notNull(), createdAt: createdAt(),
}, (table) => [unique().on(table.sourceId, table.versionNo), unique().on(table.sourceId, table.contentHash), unique().on(table.id, table.sourceId)]);

export const taskSources = core.table("task_sources", {
  workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), sourceVersionId: uuid("source_version_id").notNull(),
  selectionOrder: integer("selection_order").notNull(), selectedBy: text("selected_by").notNull().default("teacher"), selectedAt: createdAt(), reviewState: text("review_state").notNull().default("ready"),
}, (table) => [primaryKey({ columns: [table.taskId, table.sourceVersionId] }), unique().on(table.workspaceId, table.taskId, table.sourceVersionId), unique().on(table.taskId, table.selectionOrder)]);

export const evidenceClaims = core.table("evidence_claims", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), questionId: uuid("question_id"),
  claimText: text("claim_text").notNull(), ordinal: integer().notNull(), gapAccepted: boolean("gap_accepted").notNull().default(false), reviewState: text("review_state").notNull().default("ready"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.taskId, table.ordinal)]);

export const evidenceRelations = core.table("evidence_relations", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), claimId: uuid("claim_id").notNull(),
  sourceVersionId: uuid("source_version_id").notNull(), relationKind: text("relation_kind").notNull(), reason: text().notNull(), reviewState: text("review_state").notNull().default("ready"),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.taskId, table.claimId, table.sourceVersionId, table.relationKind)]);

export const evidenceCitations = core.table("evidence_citations", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), relationId: uuid("relation_id").notNull(),
  sourceVersionId: uuid("source_version_id").notNull(), chunkId: bigint("chunk_id", { mode: "number" }), locatorText: text("locator_text").notNull(),
  quotedText: text("quoted_text"), quoteHash: text("quote_hash"), ordinal: integer().notNull(), createdAt: createdAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.relationId, table.ordinal)]);

export const learningActivities = core.table("learning_activities", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), ordinal: integer().notNull(), title: text().notNull(),
  activityMinutes: integer("activity_minutes").notNull(), transitionMinutes: integer("transition_minutes").notNull(), studentAction: text("student_action").notNull(),
  evidenceProduct: text("evidence_product").notNull(), difficulty: text().notNull(), scaffold: text().notNull(), teacherEdited: boolean("teacher_edited").notNull().default(false),
  reviewState: text("review_state").notNull().default("ready"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.taskId, table.ordinal)]);

export const activitySources = core.table("activity_sources", {
  workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), activityId: uuid("activity_id").notNull(), sourceVersionId: uuid("source_version_id").notNull(),
}, (table) => [primaryKey({ columns: [table.activityId, table.sourceVersionId] })]);

export const rubricItems = core.table("rubric_items", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), ordinal: integer().notNull(), title: text().notNull(),
  teacherEdited: boolean("teacher_edited").notNull().default(false), reviewState: text("review_state").notNull().default("ready"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.taskId, table.ordinal)]);

export const rubricLevels = core.table("rubric_levels", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), rubricItemId: uuid("rubric_item_id").notNull(), levelKey: text("level_key").notNull(),
  ordinal: integer().notNull(), label: text().notNull(), description: text().notNull(),
}, (table) => [unique().on(table.rubricItemId, table.levelKey), unique().on(table.rubricItemId, table.ordinal)]);

export const rubricActivities = core.table("rubric_activities", {
  workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), rubricItemId: uuid("rubric_item_id").notNull(), activityId: uuid("activity_id").notNull(),
}, (table) => [primaryKey({ columns: [table.rubricItemId, table.activityId] })]);

export const verificationRuns = core.table("verification_runs", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), runKind: text("run_kind").notNull(),
  inputLockVersion: bigint("input_lock_version", { mode: "number" }).notNull(), status: text().notNull(), startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }), reusedFromRunId: uuid("reused_from_run_id"), summary: jsonb(), createdAt: createdAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id)]);

export const verificationFindings = core.table("verification_findings", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), runId: uuid("run_id").notNull(),
  severity: text().notNull(), category: text().notNull(), subjectKind: text("subject_kind").notNull(), subjectId: uuid("subject_id"), title: text().notNull(),
  basis: text().notNull(), impact: text().notNull(), recommendation: text(), resolutionState: text("resolution_state").notNull().default("pending"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id)]);

export const taskRevisions = core.table("task_revisions", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), revisionNo: bigint("revision_no", { mode: "number" }).notNull(),
  reason: text().notNull(), schemaVersion: integer("schema_version").notNull(), baseLockVersion: bigint("base_lock_version", { mode: "number" }).notNull(), snapshot: jsonb().notNull(),
  contentHash: text("content_hash").notNull(), createdBy: text("created_by").notNull(), createdAt: createdAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.taskId, table.revisionNo), unique().on(table.taskId, table.contentHash, table.reason)]);

export const teacherDecisions = core.table("teacher_decisions", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), findingId: uuid("finding_id"),
  taskRevisionId: uuid("task_revision_id"), decisionKind: text("decision_kind").notNull(), reason: text(), decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id)]);

export const exportRuns = core.table("export_runs", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), taskRevisionId: uuid("task_revision_id").notNull(),
  format: text().notNull(), fileName: text("file_name").notNull(), status: text().notNull(), idempotencyKey: text("idempotency_key").notNull(), errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id), unique().on(table.workspaceId, table.idempotencyKey)]);

export const embeddingProfiles = rag.table("embedding_profiles", {
  id: uuidV7PrimaryKey(), provider: text().notNull(), model: text().notNull(), dimensions: integer().notNull(), distance: text().notNull(),
  chunkerVersion: text("chunker_version").notNull(), active: boolean().notNull().default(true), createdAt: createdAt(),
}, (table) => [unique().on(table.provider, table.model, table.dimensions, table.distance, table.chunkerVersion)]);

export const sourceChunks = rag.table("source_chunks", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), sourceVersionId: uuid("source_version_id").notNull(), ordinal: integer().notNull(), heading: text(),
  contentText: text("content_text").notNull(), charStart: integer("char_start"), charEnd: integer("char_end"), locator: jsonb().notNull(), contentHash: text("content_hash").notNull(), createdAt: createdAt(),
}, (table) => [unique().on(table.sourceVersionId, table.ordinal), unique().on(table.sourceVersionId, table.contentHash), unique().on(table.id, table.sourceVersionId)]);

export const chunkEmbeddings = rag.table("chunk_embeddings", {
  chunkId: bigint("chunk_id", { mode: "number" }).notNull(), embeddingProfileId: uuid("embedding_profile_id").notNull(), embedding: vector1024().notNull(), createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.chunkId, table.embeddingProfileId] })]);

export const modelRuns = rag.table("model_runs", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), taskRevisionId: uuid("task_revision_id"), purpose: text().notNull(),
  provider: text().notNull(), model: text().notNull(), promptTemplateVersion: text("prompt_template_version").notNull(), inputFingerprint: text("input_fingerprint").notNull(), status: text().notNull(),
  resultSummary: jsonb("result_summary"), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), totalTokens: integer("total_tokens"), estimatedCost: numeric("estimated_cost", { precision: 12, scale: 6 }),
  errorCode: text("error_code"), externalThreadId: text("external_thread_id"), outputTaskRevisionId: uuid("output_task_revision_id"), actualModel: text("actual_model"),
  priceProfileVersion: text("price_profile_version"), currency: text(), startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), createdAt: createdAt(),
}, (table) => [unique().on(table.workspaceId, table.taskId, table.id)]);

export const retrievalHits = rag.table("retrieval_hits", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), modelRunId: uuid("model_run_id").notNull(),
  sourceVersionId: uuid("source_version_id").notNull(), chunkId: bigint("chunk_id", { mode: "number" }).notNull(), rank: integer().notNull(), cosineDistance: doublePrecision("cosine_distance").notNull(),
  keywordScore: doublePrecision("keyword_score"), selectedForContext: boolean("selected_for_context").notNull().default(false), createdAt: createdAt(),
}, (table) => [unique().on(table.modelRunId, table.rank), unique().on(table.modelRunId, table.chunkId)]);

export const jobs = ops.table("jobs", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id"), modelRunId: uuid("model_run_id"), jobKind: text("job_kind").notNull(), status: text().notNull().default("queued"),
  priority: integer().notNull().default(0), attempts: integer().notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(3), availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }), lockedBy: text("locked_by"), leaseToken: uuid("lease_token"), leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }), waitState: text("wait_state"), progressCurrent: integer("progress_current").notNull().default(0), progressTotal: integer("progress_total"),
  idempotencyKey: text("idempotency_key").notNull(), payload: jsonb().notNull().default({}), errorCode: text("error_code"), errorSummary: text("error_summary"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.idempotencyKey), unique().on(table.workspaceId, table.taskId, table.id)]);

export const jobEvents = ops.table("job_events", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), jobId: uuid("job_id"),
  schemaVersion: integer("schema_version").notNull().default(1), eventType: text("event_type").notNull(), payload: jsonb().notNull().default({}), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageLedger = ops.table("usage_ledger", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id").notNull(), jobId: uuid("job_id").notNull(), usageDay: date("usage_day").notNull(), usageKind: text("usage_kind").notNull(), status: text().notNull(),
  reservedCalls: integer("reserved_calls").notNull().default(0), reservedTokens: integer("reserved_tokens").notNull().default(0), reservedCnyMicros: bigint("reserved_cny_micros", { mode: "number" }).notNull().default(0),
  actualCalls: integer("actual_calls"), actualTokens: integer("actual_tokens"), actualCnyMicros: bigint("actual_cny_micros", { mode: "number" }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.jobId, table.usageKind)]);

export const runtimeComponents = ops.table("runtime_components", {
  component: text().primaryKey(), version: text().notNull(), initializedAt: timestamp("initialized_at", { withTimezone: true }).notNull().defaultNow(),
});

export const commandReceipts = ops.table("command_receipts", {
  id: uuidV7PrimaryKey(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id"), idempotencyKey: text("idempotency_key").notNull(), operation: text().notNull(), requestHash: text("request_hash").notNull(),
  status: text().notNull(), resourceKind: text("resource_kind"), resourceId: uuid("resource_id"), responseSummary: jsonb("response_summary"), expiresAt: timestamp("expires_at", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (table) => [unique().on(table.workspaceId, table.idempotencyKey)]);

export const auditEvents = ops.table("audit_events", {
  id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(), workspaceId: uuid("workspace_id").notNull(), taskId: uuid("task_id"), actorKind: text("actor_kind").notNull(), action: text().notNull(),
  entityKind: text("entity_kind").notNull(), entityId: uuid("entity_id"), correlationId: uuid("correlation_id"), metadata: jsonb().notNull().default({}), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export { core, ops, rag };
