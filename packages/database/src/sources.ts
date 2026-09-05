import { lockCommand } from "./command-lock.ts";
import { createHash } from "node:crypto";
import { NotFoundError, VersionConflictError, type WorkspaceScope } from "@tracepbl/domain";
import { canonicalHash, type Database } from "./index.ts";

export type MaterialInput = { kind: "url"; name: string; url: string; rightsAttestation: "authorizedForCurrentTask" | "unknown" } | { kind: "text"; name: string; text: string; rightsAttestation: "authorizedForCurrentTask" | "unknown" };
export class SourceRepository {
  constructor(private readonly sql: Database) {}
  async list(scope: WorkspaceScope, taskId: string) {
    const task = await this.sql`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if (!task[0]) throw new NotFoundError();
    return this.sql<Record<string, unknown>[]>`select s.id,sv.id as version_id,s.title,s.material_kind,s.canonical_url,sv.creator_or_institution,sv.source_type,sv.locator,sv.content_text,sv.rights_state,sv.verification_state,sv.period_label,sv.context_note,sv.meaning_note,sv.interpretation_note,sv.limitation_note,sv.rights_basis,(ts.source_version_id is not null) as selected,ts.selection_order
      from core.sources s join core.source_versions sv on sv.source_id=s.id
      left join core.task_sources ts on ts.workspace_id=${scope.workspaceId} and ts.task_id=${taskId} and ts.source_version_id=sv.id
      where (s.scope='catalog' or (s.scope='task_private' and s.workspace_id=${scope.workspaceId} and s.task_id=${taskId}))
      and (ts.source_version_id is not null or sv.version_no=(select max(version_no) from core.source_versions where source_id=s.id))
      order by selected desc nulls last,ts.selection_order,s.created_at,s.id,sv.version_no`;
  }
  async createMaterial(scope: WorkspaceScope, taskId: string, input: MaterialInput, idempotencyKey: string) {
    const requestHash = createHash("sha256").update(JSON.stringify({ operation: "material", taskId, input })).digest("hex");
    return this.sql.begin(async (tx) => {
      await lockCommand(tx, scope, idempotencyKey); const task = await tx`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null for update`; if (!task[0]) throw new NotFoundError();
      const old = await tx<Record<string, unknown>[]>`select request_hash,response_summary from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey}`;
      if (old[0]) { if (old[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return old[0].response_summary as Record<string, unknown>; }
      const url = input.kind === "url" ? input.url : null; const mayProcess = input.rightsAttestation === "authorizedForCurrentTask"; const content = input.kind === "text" && mayProcess ? input.text : null;
      const source = await tx<{ id: string }[]>`insert into core.sources(scope,workspace_id,task_id,material_kind,title,canonical_url,data_class) values ('task_private',${scope.workspaceId},${taskId},${input.kind},${input.name},${url},'public_unknown') returning id`;
      const hashInput = content ?? JSON.stringify({ name: input.name, url }); const version = await tx<{ id: string }[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash) values (${source[0]!.id},1,'教师提供',${input.kind === "url" ? "网页" : "文本"},${url ?? input.name},${content},${mayProcess ? "unknown" : "restricted_metadata_only"},${mayProcess ? "teacher_attested_current_task" : "rights_unknown_metadata_only"},'pending',${createHash("sha256").update(hashInput).digest("hex")}) returning id`;
      let operationId: string | null = null;
      if (mayProcess) { const kind = input.kind === "url" ? "source_check" : "embedding"; const job = await tx<{ id: string }[]>`select id from ops.enqueue_job(${scope.workspaceId},${taskId},${null},${kind},${`${idempotencyKey}:job`},${tx.json({ sourceVersionId: version[0]!.id })},0,3)`; operationId = job[0]?.id ?? null; }
      const summary = { sourceId: source[0]!.id, versionId: version[0]!.id, operationId };
      await tx`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status,resource_kind,resource_id,response_summary) values (${scope.workspaceId},${taskId},${idempotencyKey},'create_material',${requestHash},'succeeded','source',${source[0]!.id},${tx.json(summary)})`;
      await tx`insert into ops.audit_events(workspace_id,task_id,actor_kind,action,entity_kind,entity_id,metadata) values (${scope.workspaceId},${taskId},'teacher','source.rights_attested','source',${source[0]!.id},${tx.json({ rightsAttestation: input.rightsAttestation })})`;
      return summary;
    });
  }
  async select(scope: WorkspaceScope, taskId: string, expectedVersion: number, sourceVersionIds: string[]) {
    await this.sql.begin(async (tx) => {
      const changed = await tx<{lock_version:number;revision_seq:number}[]>`update core.tasks set lock_version=lock_version+1,revision_seq=revision_seq+1,workflow_state='designing',updated_at=now(),last_activity_at=now() where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null and lock_version=${expectedVersion} returning lock_version,revision_seq`;
      if (!changed[0]) { const exists=await tx`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if (!exists[0]) throw new NotFoundError(); throw new VersionConflictError(); }
      const visible = sourceVersionIds.length === 0 ? [] : await tx<{ id: string }[]>`select sv.id from core.source_versions sv join core.sources s on s.id=sv.source_id where sv.id in ${tx(sourceVersionIds)} and sv.rights_state<>'not_allowed' and (s.scope='catalog' or (s.workspace_id=${scope.workspaceId} and s.task_id=${taskId}))`;
      if (visible.length !== new Set(sourceVersionIds).size) throw new NotFoundError();
      const removed = await tx`select source_version_id from core.task_sources ts where ts.workspace_id=${scope.workspaceId} and ts.task_id=${taskId} and not(ts.source_version_id = any(${sourceVersionIds}::uuid[])) and (exists(select 1 from core.evidence_relations er where er.workspace_id=ts.workspace_id and er.task_id=ts.task_id and er.source_version_id=ts.source_version_id) or exists(select 1 from core.activity_sources a where a.workspace_id=ts.workspace_id and a.task_id=ts.task_id and a.source_version_id=ts.source_version_id) or exists(select 1 from core.evidence_citations ec where ec.workspace_id=ts.workspace_id and ec.task_id=ts.task_id and ec.source_version_id=ts.source_version_id) or exists(select 1 from rag.retrieval_hits rh where rh.workspace_id=ts.workspace_id and rh.task_id=ts.task_id and rh.source_version_id=ts.source_version_id))`;
      if(removed[0]) throw new Error("INVALID_STATE");
      await tx`update core.task_sources set selection_order=selection_order+100000 where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`delete from core.task_sources where workspace_id=${scope.workspaceId} and task_id=${taskId} and not(source_version_id = any(${sourceVersionIds}::uuid[]))`;
      for (const [index, sourceVersionId] of sourceVersionIds.entries()) await tx`insert into core.task_sources(workspace_id,task_id,source_version_id,selection_order,selected_by) values (${scope.workspaceId},${taskId},${sourceVersionId},${index},'teacher') on conflict(task_id,source_version_id) do update set selection_order=excluded.selection_order,selected_at=now(),review_state='ready'`;
      await tx`update core.evidence_relations set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await tx`update core.learning_activities set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await tx`update core.rubric_items set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      const snapshots=await tx<{snapshot:Record<string,unknown>}[]>`select core.current_task_snapshot(${scope.workspaceId},${taskId}) as snapshot`; const snapshot=snapshots[0]!.snapshot;
      await tx`insert into core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by) values (${scope.workspaceId},${taskId},${changed[0]!.revision_seq},'teacher_confirmed',1,${expectedVersion},${tx.json(snapshot as Parameters<typeof tx.json>[0])},${canonicalHash(snapshot)},'teacher') on conflict(task_id,content_hash,reason) do nothing`;
    });
  }
}
