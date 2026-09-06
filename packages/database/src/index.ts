import { lockCommand } from "./command-lock.ts";
import { createHash } from "node:crypto";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { DeletionJournal } from "./recovery.ts";
import { NotFoundError, VersionConflictError, type JobStatus, type WorkspaceScope } from "@tracepbl/domain";

export type Database = Sql<Record<string, never>>;
export function connectDatabase(url: string, maximum = 10): Database { return postgres(url, { max: maximum, onnotice: () => undefined }); }
export function canonicalHash(value: unknown) { return createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex"); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}

export type TaskRow = { id: string; title: string; workflowState: "draft" | "in_progress" | "approved"; lockVersion: number; deletedAt: Date | null; createdAt: Date; updatedAt: Date };
export type ContextInput = { stage: string; grade: string; textbook: string; lesson: string; lessonTypes: string[]; minutes: number; inquiryDirection: string | null; priorKnowledge: string | null; learningNeeds: string[]; profileNote: string | null };
export type JobRow = { id: string; workspaceId: string; taskId: string; modelRunId: string | null; jobKind: string; status: JobStatus; attempts: number; maxAttempts: number; leaseToken: string | null; waitState: string | null; progressCurrent: number; progressTotal: number | null; cancelRequestedAt: Date | null; payload: Record<string, unknown>; startedAt: Date | null; updatedAt: Date; errorCode: string | null };

function taskFrom(row: Record<string, unknown>): TaskRow {
  const stored = String(row.workflow_state); const workflowState: TaskRow["workflowState"] = stored === "approved" ? "approved" : stored === "draft" ? "draft" : "in_progress";
  return { id: String(row.id), title: String(row.title), workflowState, lockVersion: Number(row.lock_version), deletedAt: row.deleted_at as Date | null, createdAt: row.created_at as Date, updatedAt: row.updated_at as Date };
}
function jobFrom(row: Record<string, unknown>): JobRow {
  return { id: String(row.id), workspaceId: String(row.workspace_id), taskId: String(row.task_id), modelRunId: row.model_run_id ? String(row.model_run_id) : null, jobKind: String(row.job_kind), status: row.status as JobStatus, attempts: Number(row.attempts), maxAttempts: Number(row.max_attempts), leaseToken: row.lease_token ? String(row.lease_token) : null, waitState: row.wait_state ? String(row.wait_state) : null, progressCurrent: Number(row.progress_current), progressTotal: row.progress_total === null ? null : Number(row.progress_total), cancelRequestedAt: row.cancel_requested_at as Date | null, payload: row.payload as Record<string, unknown>, startedAt: row.locked_at as Date | null, updatedAt: row.updated_at as Date, errorCode: row.error_code ? String(row.error_code) : null };
}
function publicJobKind(kind:string){return kind==="source_check"?"sourceCheck":kind;}

export class TaskRepository {
  constructor(private readonly sql: Database, private readonly recovery?: DeletionJournal) {}
  private async deletionTransaction<T>(operation: (tx: TransactionSql<Record<string, never>>) => Promise<T>): Promise<T> {
    if (this.recovery) return this.recovery.transaction(this.sql, operation);
    return await this.sql.begin(operation) as T;
  }
  async detail(scope: WorkspaceScope, taskId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`select t.*,
      (select id from core.task_revisions where workspace_id=t.workspace_id and task_id=t.id and reason='teacher_confirmed' order by revision_no desc limit 1) as teacher_revision,
      (select id from core.task_revisions where workspace_id=t.workspace_id and task_id=t.id and reason='final_approved' order by revision_no desc limit 1) as approved_revision,
      (select id from core.verification_runs where workspace_id=t.workspace_id and task_id=t.id and run_kind='design_audit' order by created_at desc,id desc limit 1) as audit_id,
      jsonb_build_object(
        'questionSet',case when exists(select 1 from core.inquiry_questions where workspace_id=t.workspace_id and task_id=t.id and review_state='needs_review') then 'needs_review' else 'ready' end,
        'sourceSelection',case when exists(select 1 from core.task_sources where workspace_id=t.workspace_id and task_id=t.id and review_state='needs_review') then 'needs_review' else 'ready' end,
        'evidenceMap',case when exists(select 1 from core.evidence_claims where workspace_id=t.workspace_id and task_id=t.id and review_state='needs_review') or exists(select 1 from core.evidence_relations where workspace_id=t.workspace_id and task_id=t.id and review_state='needs_review') then 'needs_review' else 'ready' end,
        'lessonDesign',case when exists(select 1 from core.learning_activities where workspace_id=t.workspace_id and task_id=t.id and review_state='needs_review') then 'needs_review' else 'ready' end,
        'rubric',case when exists(select 1 from core.rubric_items where workspace_id=t.workspace_id and task_id=t.id and review_state='needs_review') then 'needs_review' else 'ready' end
      ) as review_states
      from core.tasks t where t.workspace_id=${scope.workspaceId} and t.id=${taskId} and t.deleted_at is null`;
    const row = rows[0]; if (!row) throw new NotFoundError();
    return { ...taskFrom(row), latestTeacherRevisionId: row.teacher_revision ?? null, latestApprovedRevisionId: row.approved_revision ?? null, latestAuditId: row.audit_id ?? null, reviewStates: row.review_states };
  }
  async localWorkspaceId() {
    const rows = await this.sql<{ id: string }[]>`select id from core.workspaces where mode = 'local_single_user' order by created_at limit 1`;
    if (!rows[0]) throw new Error("local workspace is not initialized"); return rows[0].id;
  }
  async list(scope: WorkspaceScope, limit: number, before?: { updatedAt: Date; id: string }) {
    const rows = before
      ? await this.sql<Record<string, unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at from core.tasks where workspace_id=${scope.workspaceId} and deleted_at is null and (updated_at,id)<(${before.updatedAt},${before.id}) order by updated_at desc,id desc limit ${limit + 1}`
      : await this.sql<Record<string, unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at from core.tasks where workspace_id=${scope.workspaceId} and deleted_at is null order by updated_at desc,id desc limit ${limit + 1}`;
    return rows.map(taskFrom);
  }
  async get(scope: WorkspaceScope, taskId: string, includeDeleted = false) {
    const rows = includeDeleted
      ? await this.sql<Record<string, unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at,purge_after from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId}`
      : await this.sql<Record<string, unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`;
    if (!rows[0]) throw new NotFoundError(); return { ...taskFrom(rows[0]), purgeAfter: (rows[0].purge_after as Date | undefined) ?? null };
  }
  async create(scope: WorkspaceScope, title: string, idempotencyKey: string) {
    const requestHash = canonicalHash({ operation: "createTask", title });
    return this.sql.begin(async (tx) => {
      await lockCommand(tx, scope, idempotencyKey); const old = await tx<Record<string, unknown>[]>`select request_hash,status,resource_id from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey} for update`;
      if (old[0]) {
        if (old[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
        if (!old[0].resource_id) throw new Error("INVALID_STATE");
        const replay = await tx<Record<string, unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at from core.tasks where workspace_id=${scope.workspaceId} and id=${old[0].resource_id as string}`;
        if (!replay[0]) throw new NotFoundError(); return taskFrom(replay[0]);
      }
      await tx`insert into ops.command_receipts(workspace_id,idempotency_key,operation,request_hash,status) values (${scope.workspaceId},${idempotencyKey},'create_task',${requestHash},'processing')`;
      const rows = await tx<Record<string, unknown>[]>`insert into core.tasks(workspace_id,title,revision_seq) values (${scope.workspaceId},${title},1) returning id,title,workflow_state,lock_version,deleted_at,created_at,updated_at`;
      const task = taskFrom(rows[0]!);
      const snapshotRows=await tx<{snapshot:Record<string,unknown>}[]>`select core.current_task_snapshot(${scope.workspaceId},${task.id}) as snapshot`; const snapshot=snapshotRows[0]!.snapshot;
      await tx`insert into core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by) values (${scope.workspaceId},${task.id},1,'teacher_confirmed',1,0,${tx.json(snapshot as Parameters<typeof tx.json>[0])},${canonicalHash(snapshot)},'teacher')`;
      await tx`update ops.command_receipts set status='succeeded',resource_kind='task',resource_id=${task.id},response_summary=${tx.json({ id: task.id })},updated_at=now() where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey}`;
      return task;
    });
  }
  async copy(scope:WorkspaceScope,sourceTaskId:string,title:string|undefined,idempotencyKey:string){const requestHash=canonicalHash({operation:"copyTask",sourceTaskId,title:title??null});return this.sql.begin(async tx=>{const oldReceipt=await tx<Record<string,unknown>[]>`select request_hash,resource_id from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey} for update`;if(oldReceipt[0]){if(oldReceipt[0].request_hash!==requestHash)throw new Error("IDEMPOTENCY_KEY_REUSED");const replay=await tx<Record<string,unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at from core.tasks where workspace_id=${scope.workspaceId} and id=${String(oldReceipt[0].resource_id)} and deleted_at is null`;if(!replay[0])throw new NotFoundError();return taskFrom(replay[0]);}const source=await tx<Record<string,unknown>[]>`select id,title from core.tasks where workspace_id=${scope.workspaceId} and id=${sourceTaskId} and deleted_at is null for update`;if(!source[0])throw new NotFoundError();const created=await tx<Record<string,unknown>[]>`insert into core.tasks(workspace_id,title,workflow_state) values (${scope.workspaceId},${title??`${String(source[0].title)}（副本）`},'designing') returning id,title,workflow_state,lock_version,deleted_at,created_at,updated_at`;const targetId=String(created[0]!.id);
    await tx`insert into core.task_contexts(task_id,workspace_id,stage,grade,textbook,lesson,lesson_types,minutes,inquiry_direction,prior_knowledge,learning_needs,profile_note) select ${targetId},workspace_id,stage,grade,textbook,lesson,lesson_types,minutes,inquiry_direction,prior_knowledge,learning_needs,profile_note from core.task_contexts where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId}`;
    const questionMap=new Map<string,string>();const questions=await tx<Record<string,unknown>[]>`select * from core.inquiry_questions where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by ordinal`;for(const item of questions){const parent=item.parent_id?questionMap.get(String(item.parent_id))??null:null;const inserted=await tx<{id:string}[]>`insert into core.inquiry_questions(workspace_id,task_id,parent_id,kind,ordinal,question_text,input_type,evidence_outcome,scope_boundary,confirmed_at,review_state) values (${scope.workspaceId},${targetId},${parent},${String(item.kind)},${Number(item.ordinal)},${String(item.question_text)},${item.input_type as string|null},${item.evidence_outcome as string|null},${item.scope_boundary as string|null},${item.confirmed_at as Date|null},${String(item.review_state)}) returning id`;questionMap.set(String(item.id),inserted[0]!.id);}
    const sourceMap=new Map<string,string>();const privateVersions=await tx<{id:string}[]>`select sv.id from core.sources s join lateral(select id from core.source_versions where source_id=s.id order by version_no desc limit 1)sv on true where s.scope='task_private' and s.workspace_id=${scope.workspaceId} and s.task_id=${sourceTaskId}`;for(const item of privateVersions){const cloned=await tx<{id:string|null}[]>`select ops.clone_private_source_version(${scope.workspaceId},${sourceTaskId},${targetId},${item.id}) as id`;if(!cloned[0]?.id)throw new Error("INVALID_STATE");sourceMap.set(item.id,cloned[0].id);}const selections=await tx<Record<string,unknown>[]>`select source_version_id,selection_order,review_state from core.task_sources where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by selection_order`;for(const item of selections){const oldVersion=String(item.source_version_id);const newVersion=sourceMap.get(oldVersion)??oldVersion;sourceMap.set(oldVersion,newVersion);await tx`insert into core.task_sources(workspace_id,task_id,source_version_id,selection_order,selected_by,selected_at,review_state) values (${scope.workspaceId},${targetId},${newVersion},${Number(item.selection_order)},'teacher',now(),${String(item.review_state)})`;}
    const claimMap=new Map<string,string>();const claims=await tx<Record<string,unknown>[]>`select * from core.evidence_claims where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by ordinal`;for(const item of claims){const inserted=await tx<{id:string}[]>`insert into core.evidence_claims(workspace_id,task_id,question_id,claim_text,ordinal,gap_accepted,review_state) values (${scope.workspaceId},${targetId},${item.question_id?questionMap.get(String(item.question_id))??null:null},${String(item.claim_text)},${Number(item.ordinal)},${Boolean(item.gap_accepted)},${String(item.review_state)}) returning id`;claimMap.set(String(item.id),inserted[0]!.id);}const relationMap=new Map<string,string>();const relations=await tx<Record<string,unknown>[]>`select * from core.evidence_relations where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by created_at,id`;for(const item of relations){const newVersion=sourceMap.get(String(item.source_version_id))??String(item.source_version_id);const inserted=await tx<{id:string}[]>`insert into core.evidence_relations(workspace_id,task_id,claim_id,source_version_id,relation_kind,reason,review_state) values (${scope.workspaceId},${targetId},${claimMap.get(String(item.claim_id))!},${newVersion},${String(item.relation_kind)},${String(item.reason)},${String(item.review_state)}) returning id`;relationMap.set(String(item.id),inserted[0]!.id);}const citations=await tx<Record<string,unknown>[]>`select * from core.evidence_citations where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by relation_id,ordinal`;for(const item of citations){const oldVersion=String(item.source_version_id);const newVersion=sourceMap.get(oldVersion)??oldVersion;let newChunk:number|null=item.chunk_id===null?null:Number(item.chunk_id);if(newChunk!==null&&newVersion!==oldVersion){const mapped=await tx<{id:number}[]>`select nc.id from rag.source_chunks oc join rag.source_chunks nc on nc.source_version_id=${newVersion} and nc.content_hash=oc.content_hash and nc.ordinal=oc.ordinal where oc.id=${newChunk} and oc.source_version_id=${oldVersion}`;newChunk=mapped[0]?.id??null;}await tx`insert into core.evidence_citations(workspace_id,task_id,relation_id,source_version_id,chunk_id,locator_text,quoted_text,quote_hash,ordinal) values (${scope.workspaceId},${targetId},${relationMap.get(String(item.relation_id))!},${newVersion},${newChunk},${String(item.locator_text)},${newChunk===null?null:item.quoted_text as string|null},${newChunk===null?null:item.quote_hash as string|null},${Number(item.ordinal)})`;}
    const activityMap=new Map<string,string>();const activities=await tx<Record<string,unknown>[]>`select * from core.learning_activities where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by ordinal`;for(const item of activities){const inserted=await tx<{id:string}[]>`insert into core.learning_activities(workspace_id,task_id,ordinal,title,activity_minutes,transition_minutes,student_action,evidence_product,difficulty,scaffold,teacher_edited,review_state) values (${scope.workspaceId},${targetId},${Number(item.ordinal)},${String(item.title)},${Number(item.activity_minutes)},${Number(item.transition_minutes)},${String(item.student_action)},${String(item.evidence_product)},${String(item.difficulty)},${String(item.scaffold)},${Boolean(item.teacher_edited)},${String(item.review_state)}) returning id`;activityMap.set(String(item.id),inserted[0]!.id);}const activitySources=await tx<Record<string,unknown>[]>`select activity_id,source_version_id from core.activity_sources where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId}`;for(const item of activitySources)await tx`insert into core.activity_sources(workspace_id,task_id,activity_id,source_version_id) values (${scope.workspaceId},${targetId},${activityMap.get(String(item.activity_id))!},${sourceMap.get(String(item.source_version_id))??String(item.source_version_id)})`;
    const rubricMap=new Map<string,string>();const rubricItems=await tx<Record<string,unknown>[]>`select * from core.rubric_items where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId} order by ordinal`;for(const item of rubricItems){const inserted=await tx<{id:string}[]>`insert into core.rubric_items(workspace_id,task_id,ordinal,title,teacher_edited,review_state) values (${scope.workspaceId},${targetId},${Number(item.ordinal)},${String(item.title)},${Boolean(item.teacher_edited)},${String(item.review_state)}) returning id`;rubricMap.set(String(item.id),inserted[0]!.id);await tx`insert into core.rubric_levels(rubric_item_id,level_key,ordinal,label,description) select ${inserted[0]!.id},level_key,ordinal,label,description from core.rubric_levels where rubric_item_id=${String(item.id)}`;}const rubricLinks=await tx<Record<string,unknown>[]>`select rubric_item_id,activity_id from core.rubric_activities where workspace_id=${scope.workspaceId} and task_id=${sourceTaskId}`;for(const item of rubricLinks)await tx`insert into core.rubric_activities(workspace_id,task_id,rubric_item_id,activity_id) values (${scope.workspaceId},${targetId},${rubricMap.get(String(item.rubric_item_id))!},${activityMap.get(String(item.activity_id))!})`;
    await tx`update core.tasks set revision_seq=1 where id=${targetId}`;const snapshots=await tx<{snapshot:Record<string,unknown>}[]>`select core.current_task_snapshot(${scope.workspaceId},${targetId}) as snapshot`;const snapshot=snapshots[0]!.snapshot;await tx`insert into core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by) values (${scope.workspaceId},${targetId},1,'teacher_confirmed',1,0,${tx.json(snapshot as Parameters<typeof tx.json>[0])},${canonicalHash(snapshot)},'teacher')`;await tx`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status,resource_kind,resource_id,response_summary) values (${scope.workspaceId},${targetId},${idempotencyKey},'copy_task',${requestHash},'succeeded','task',${targetId},${tx.json({id:targetId})})`;return taskFrom(created[0]!);});}
  async getContext(scope: WorkspaceScope, taskId: string) {
    await this.get(scope, taskId);
    const rows = await this.sql<Record<string, unknown>[]>`select stage,grade,textbook,lesson,lesson_types,minutes,inquiry_direction,prior_knowledge,learning_needs,profile_note,updated_at from core.task_contexts where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
    return rows[0] ?? null;
  }
  async putContext(scope: WorkspaceScope, taskId: string, expectedVersion: number, input: ContextInput) {
    return this.sql.begin(async (tx) => {
      const changed = await tx<Record<string, unknown>[]>`update core.tasks set title=${input.lesson},lock_version=lock_version+1,revision_seq=revision_seq+1,workflow_state='designing',last_activity_at=now(),updated_at=now() where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null and lock_version=${expectedVersion} returning id,title,workflow_state,lock_version,deleted_at,created_at,updated_at,revision_seq`;
      if (!changed[0]) {
        const exists = await tx`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`;
        if (!exists[0]) throw new NotFoundError(); throw new VersionConflictError();
      }
      const storedStage = input.stage === "初中" ? "junior" : "senior";
      await tx`insert into core.task_contexts(task_id,workspace_id,stage,grade,textbook,lesson,lesson_types,minutes,inquiry_direction,prior_knowledge,learning_needs,profile_note)
        values (${taskId},${scope.workspaceId},${storedStage},${input.grade},${input.textbook},${input.lesson},${input.lessonTypes},${input.minutes},${input.inquiryDirection},${input.priorKnowledge},${input.learningNeeds},${input.profileNote})
        on conflict(task_id) do update set stage=excluded.stage,grade=excluded.grade,textbook=excluded.textbook,lesson=excluded.lesson,lesson_types=excluded.lesson_types,minutes=excluded.minutes,inquiry_direction=excluded.inquiry_direction,prior_knowledge=excluded.prior_knowledge,learning_needs=excluded.learning_needs,profile_note=excluded.profile_note,updated_at=now()`;
      await tx`update core.task_sources set review_state='needs_review' where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`update core.inquiry_questions set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`update core.evidence_claims set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`update core.evidence_relations set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`update core.learning_activities set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`update core.rubric_items set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      const row = changed[0]; const snapshotRows=await tx<{snapshot:Record<string,unknown>}[]>`select core.current_task_snapshot(${scope.workspaceId},${taskId}) as snapshot`; const snapshot=snapshotRows[0]!.snapshot;
      await tx`insert into core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by) values (${scope.workspaceId},${taskId},${Number(row.revision_seq)},'teacher_confirmed',1,${expectedVersion},${tx.json(snapshot as Parameters<typeof tx.json>[0])},${canonicalHash(snapshot)},'teacher') on conflict(task_id,content_hash,reason) do nothing`;
      await tx`insert into ops.audit_events(workspace_id,task_id,actor_kind,action,entity_kind,entity_id,metadata) values (${scope.workspaceId},${taskId},'teacher','context.updated','task',${taskId},${tx.json({ lockVersion: Number(row.lock_version) })})`;
      return taskFrom(row);
    });
  }
  async softDelete(scope: WorkspaceScope, taskId: string, expectedVersion: number, idempotencyKey: string) {
    const requestHash = canonicalHash({ operation: "deleteTask", taskId, expectedVersion });
    return this.deletionTransaction(async (tx) => {
      await lockCommand(tx, scope, idempotencyKey); const old = await tx<Record<string, unknown>[]>`select request_hash,response_summary from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey} for update`;
      if (old[0]) { if (old[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return old[0].response_summary as { deletedAt: string; purgeAfter: string; lockVersion: number }; }
      const rows = await tx<{ deleted_at: Date; purge_after: Date; lock_version: number }[]>`update core.tasks set deleted_at=now(),purge_after=now()+interval '24 hours',lock_version=lock_version+1,updated_at=now() where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null and lock_version=${expectedVersion} returning deleted_at,purge_after,lock_version`;
      if (!rows[0]) { const exists = await tx`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if (!exists[0]) throw new NotFoundError(); throw new VersionConflictError(); }
      const job = await tx<{ id: string }[]>`select id from ops.schedule_task_purge(${scope.workspaceId},${taskId},${`${idempotencyKey}:purge`})`;
      if (!job[0]?.id) throw new Error("purge job was not scheduled");
      const summary = { deletedAt: rows[0].deleted_at.toISOString(), purgeAfter: rows[0].purge_after.toISOString(), lockVersion: Number(rows[0].lock_version) };
      await tx`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status,resource_kind,resource_id,response_summary) values (${scope.workspaceId},${taskId},${idempotencyKey},'delete_task',${requestHash},'succeeded','task',${taskId},${tx.json(summary)})`;
      return summary;
    });
  }
  async restore(scope: WorkspaceScope, taskId: string, expectedVersion: number, idempotencyKey: string) {
    const requestHash=canonicalHash({operation:"restoreTask",taskId,expectedVersion});
    return this.deletionTransaction(async(tx)=>{ await lockCommand(tx, scope, idempotencyKey); const old=await tx<Record<string,unknown>[]>`select request_hash from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey} for update`; if(old[0]&&old[0].request_hash!==requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
      if(!old[0]) await tx`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status,resource_kind,resource_id) values (${scope.workspaceId},${taskId},${idempotencyKey},'restore_task',${requestHash},'processing','task',${taskId})`;
      const rows=await tx<Record<string,unknown>[]>`select * from ops.restore_task(${scope.workspaceId},${taskId},${expectedVersion})`; if(!rows[0]?.id){ if(old[0]) { const replay=await tx<Record<string,unknown>[]>`select id,title,workflow_state,lock_version,deleted_at,created_at,updated_at from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if(replay[0]) return taskFrom(replay[0]); } throw new NotFoundError(); }
      await tx`update ops.command_receipts set status='succeeded',response_summary=${tx.json({id:taskId})},updated_at=now() where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey}`; return taskFrom(rows[0]); });
  }
}

export class JobRepository {
  constructor(private readonly sql: Database) {}
  async list(scope: WorkspaceScope, taskId: string, limit: number, before?: string) {
    await new TaskRepository(this.sql).get(scope, taskId);
    const rows = await this.sql<Record<string, unknown>[]>`select j.* from ops.jobs j where j.workspace_id=${scope.workspaceId} and j.task_id=${taskId} and j.job_kind<>'purge' and (${before ?? null}::uuid is null or j.id<${before ?? null}::uuid) and exists(select 1 from core.tasks where workspace_id=j.workspace_id and id=j.task_id and deleted_at is null) order by j.id desc limit ${limit + 1}`;
    return rows.map(jobFrom);
  }
  async get(scope: WorkspaceScope, taskId: string, jobId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`select * from ops.jobs where workspace_id=${scope.workspaceId} and task_id=${taskId} and id=${jobId} and job_kind<>'purge' and exists(select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null)`;
    if (!rows[0]) throw new NotFoundError(); return jobFrom(rows[0]);
  }
  async cancel(scope: WorkspaceScope, taskId: string, jobId: string, idempotencyKey: string) {
    const requestHash = canonicalHash({ operation: "cancelJob", taskId, jobId });
    return this.sql.begin(async (tx) => {
      await lockCommand(tx, scope, idempotencyKey);
      const visible = await tx`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null for update`;
      if (!visible[0]) throw new NotFoundError();
      const target = await tx`select 1 from ops.jobs where workspace_id=${scope.workspaceId} and task_id=${taskId} and id=${jobId} and job_kind<>'purge'`;
      if (!target[0]) throw new NotFoundError();
      const old = await tx<Record<string, unknown>[]>`select request_hash from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey} for update`;
      if (old[0] && old[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
      if (!old[0]) await tx`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status,resource_kind,resource_id) values (${scope.workspaceId},${taskId},${idempotencyKey},'cancel_job',${requestHash},'processing','job',${jobId})`;
      const rows = await tx<Record<string, unknown>[]>`select * from ops.request_job_cancellation(${scope.workspaceId},${taskId},${jobId})`;
      if (!rows[0]?.id) throw new NotFoundError(); const job = jobFrom(rows[0]);
      await tx`update ops.command_receipts set status='succeeded',response_summary=${tx.json({ status: job.status })},updated_at=now() where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey}`;
      return job;
    });
  }
  async events(scope: WorkspaceScope, taskId: string, afterId: number, limit = 100) {
    await new TaskRepository(this.sql).get(scope, taskId);
    return this.sql<Record<string, unknown>[]>`select id,schema_version,event_type,payload,occurred_at from ops.job_events where workspace_id=${scope.workspaceId} and task_id=${taskId} and id>${afterId} order by id limit ${limit}`;
  }
  async eventExists(scope: WorkspaceScope, taskId: string, eventId: number) {
    await new TaskRepository(this.sql).get(scope, taskId);
    const rows = await this.sql`select 1 from ops.job_events where workspace_id=${scope.workspaceId} and task_id=${taskId} and id=${eventId}`;
    return rows.length === 1;
  }
  async claim(workerId: string, leaseSeconds = 30) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Record<string, unknown>[]>`with candidate as (
        select id from ops.jobs where (status='queued' and available_at<=now()) or (status='running' and wait_state is null and lease_expires_at<now())
        order by priority desc,available_at,id for update skip locked limit 1
      ) update ops.jobs j set status='running',attempts=j.attempts+1,locked_at=now(),locked_by=${workerId},lease_token=uuidv7(),lease_expires_at=now()+(${leaseSeconds}*interval '1 second'),updated_at=now()
      from candidate where j.id=candidate.id returning j.*`;
      if (!rows[0]) return null;
      const job = jobFrom(rows[0]);
      await tx`insert into ops.job_events(workspace_id,task_id,job_id,event_type,payload) values (${String(rows[0].workspace_id)},${job.taskId},${job.id},'operation.running',${tx.json({ operationId: job.id, kind: publicJobKind(job.jobKind), attempt: job.attempts, canCancel: job.jobKind !== "purge" })})`;
      return job;
    });
  }
  async finish(jobId: string, leaseToken: string, status: Extract<JobStatus, "succeeded" | "failed" | "cancelled" | "stale">, errorCode?: string) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Record<string, unknown>[]>`update ops.jobs set status=${status},error_code=${errorCode ?? null},lease_token=null,lease_expires_at=null,locked_by=null,wait_state=null,updated_at=now() where id=${jobId} and status='running' and lease_token=${leaseToken} and (${status}='cancelled' or cancel_requested_at is null) returning *`;
      if (!rows[0]) return false;
      if (rows[0].model_run_id && status !== "succeeded") await tx`update rag.model_runs set status=${status},error_code=${errorCode ?? null},completed_at=now() where id=${String(rows[0].model_run_id)} and status in ('queued','running')`;
      const payload=rows[0].payload as Record<string,unknown>;
      if (status !== "succeeded" && typeof payload.runId === "string") await tx`update core.verification_runs set status=${status},completed_at=now() where workspace_id=${String(rows[0].workspace_id)} and task_id=${String(rows[0].task_id)} and id=${payload.runId} and status in ('queued','running')`;
      if (status !== "succeeded" && typeof payload.exportId === "string") await tx`update core.export_runs set status=${status === "stale" ? "failed" : status},completed_at=now() where workspace_id=${String(rows[0].workspace_id)} and task_id=${String(rows[0].task_id)} and id=${payload.exportId} and status in ('queued','running')`;
      if (status !== "succeeded") await tx`update ops.usage_ledger set status='released',actual_calls=0,actual_tokens=0,actual_cny_micros=0,updated_at=now() where job_id=${jobId} and status='reserved'`;
      const eventType = `operation.${status}`;const taskId=String(rows[0].task_id);const resultHref=status==="succeeded"&&typeof payload.runId==="string"?`/api/v1/tasks/${taskId}/audits/${payload.runId}`:status==="succeeded"&&typeof payload.exportId==="string"?`/api/v1/tasks/${taskId}/exports/${payload.exportId}/manifest`:undefined;
      await tx`insert into ops.job_events(workspace_id,task_id,job_id,event_type,payload) values (${String(rows[0].workspace_id)},${taskId},${jobId},${eventType},${tx.json({ operationId: jobId, kind: publicJobKind(String(rows[0].job_kind)), attempt: Number(rows[0].attempts), canCancel: false, ...(resultHref?{resultHref}:{}),...(errorCode ? { errorCode } : {}) })})`;
      return true;
    });
  }
  async renew(jobId: string, leaseToken: string, leaseSeconds = 30) {
    const rows = await this.sql`update ops.jobs set lease_expires_at=now()+(${leaseSeconds}*interval '1 second'),updated_at=now() where id=${jobId} and status='running' and lease_token=${leaseToken} and cancel_requested_at is null returning id`;
    return rows.length === 1;
  }
  async cancellationRequested(jobId: string, leaseToken: string) {
    const rows = await this.sql<{ cancel_requested_at: Date | null }[]>`select cancel_requested_at from ops.jobs where id=${jobId} and status='running' and lease_token=${leaseToken}`;
    return !rows[0] || rows[0].cancel_requested_at !== null;
  }
  async releaseForRetry(jobId: string, leaseToken: string, delaySeconds: number, errorCode: string) {
    const rows = await this.sql`update ops.jobs set status='queued',available_at=now()+(${delaySeconds}*interval '1 second'),lease_token=null,lease_expires_at=null,locked_by=null,error_code=${errorCode},updated_at=now() where id=${jobId} and status='running' and lease_token=${leaseToken} and cancel_requested_at is null and attempts<max_attempts returning id`;
    return rows.length === 1;
  }
  async pauseForTeacher(jobId: string, leaseToken: string, generatedRevisionId: string) {
    return this.sql.begin(async (tx) => {
      const rows = await tx<Record<string, unknown>[]>`update ops.jobs set wait_state='teacher',lease_token=null,lease_expires_at=null,locked_by=null,updated_at=now(),payload=payload||${tx.json({ generatedRevisionId })} where id=${jobId} and status='running' and lease_token=${leaseToken} and cancel_requested_at is null returning *`;
      if (!rows[0]) return false;
      await tx`insert into ops.job_events(workspace_id,task_id,job_id,event_type,payload) values (${String(rows[0].workspace_id)},${String(rows[0].task_id)},${jobId},'operation.paused',${tx.json({ operationId: jobId, kind: publicJobKind(String(rows[0].job_kind)), attempt: Number(rows[0].attempts), canCancel: true, resultHref: `/api/v1/tasks/${String(rows[0].task_id)}/proposals/${generatedRevisionId}` })})`;
      return true;
    });
  }
}

export { ContentRepository, type EvidenceMapInput, type LessonDesignInput, type QuestionSetInput, type RubricInput } from "./content.ts";
export { SourceRepository, type MaterialInput } from "./sources.ts";
export { AiJobRepository, type ProposalInput } from "./ai-jobs.ts";
export { WorkflowRepository, type AuditRequest, type DecisionInput, type ExportInput } from "./workflow.ts";
export { DeletionJournal, RecoveryRequired, defaultRecoveryPath, recoverySnapshot, recoveryTaskDigest, type RecoveryFile, type RecoveryEvent } from "./recovery.ts";
