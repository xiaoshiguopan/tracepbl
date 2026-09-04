import { createHash } from "node:crypto";
import type { TransactionSql } from "postgres";
import { NotFoundError, VersionConflictError, type WorkspaceScope } from "@tracepbl/domain";
import type { Database } from "./index.ts";

export type QuestionSetInput = { centralQuestion: string; subQuestions: string[]; inputType?: string | null | undefined; evidenceOutcome?: string | undefined; scopeBoundary?: string | undefined; confirmed: boolean };
export type EvidenceMapInput = { claims: Array<{ text: string; gapAccepted: boolean; relations: Array<{ sourceVersionId: string; kind: string; reason: string; citations: Array<{ sourceVersionId: string; chunkId: number | null; quotedText: string | null }> }> }> };
export type LessonDesignInput = { activities: Array<{ title: string; activityMinutes: number; transitionMinutes: number; studentAction: string; evidenceProduct: string; difficulty: string; scaffold: string; sourceVersionIds: string[] }> };
export type RubricInput = { items: Array<{ title: string; activityOrdinals: number[]; levels: Array<{ key: string; label: string; description: string }> }> };

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
type Transaction = TransactionSql<Record<string, never>>;
async function advance(tx: Transaction, scope: WorkspaceScope, taskId: string, expectedVersion: number) {
  const rows = await tx<{ lock_version: number; revision_seq: number }[]>`update core.tasks set lock_version=lock_version+1,revision_seq=revision_seq+1,workflow_state='designing',last_activity_at=now(),updated_at=now() where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null and lock_version=${expectedVersion} returning lock_version,revision_seq`;
  if (rows[0]) return rows[0];
  const exists = await tx`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`;
  if (!exists[0]) throw new NotFoundError(); throw new VersionConflictError();
}
async function revision(tx: Transaction, scope: WorkspaceScope, taskId: string, changed: { lock_version: number; revision_seq: number }, expectedVersion: number) {
  const rows=await tx<{snapshot:Record<string,unknown>}[]>`select core.current_task_snapshot(${scope.workspaceId},${taskId}) as snapshot`; const snapshot=rows[0]!.snapshot;
  await tx`insert into core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by) values (${scope.workspaceId},${taskId},${changed.revision_seq},'teacher_confirmed',1,${expectedVersion},${tx.json(snapshot as Parameters<typeof tx.json>[0])},${hash(snapshot)},'teacher') on conflict(task_id,content_hash,reason) do nothing`;
}

export class ContentRepository {
  constructor(private readonly sql: Database) {}
  async questionSet(scope: WorkspaceScope, taskId: string) {
    const task = await this.sql`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if (!task[0]) throw new NotFoundError();
    const rows = await this.sql<Record<string, unknown>[]>`select kind,ordinal,question_text,input_type,evidence_outcome,scope_boundary,confirmed_at from core.inquiry_questions where workspace_id=${scope.workspaceId} and task_id=${taskId} order by ordinal`;
    const central = rows.find((row) => row.kind === "central"); if (!central) return null;
    return { centralQuestion: String(central.question_text), subQuestions: rows.filter((row) => row.kind === "sub").map((row) => String(row.question_text)), inputType: central.input_type ? String(central.input_type) : null, evidenceOutcome: central.evidence_outcome ? String(central.evidence_outcome) : undefined, scopeBoundary: central.scope_boundary ? String(central.scope_boundary) : undefined, confirmed: Boolean(central.confirmed_at) };
  }
  async putQuestionSet(scope: WorkspaceScope, taskId: string, expectedVersion: number, input: QuestionSetInput) {
    await this.sql.begin(async (tx) => {
      const changed = await advance(tx, scope, taskId, expectedVersion);
      await tx`update core.evidence_claims set question_id=null,review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`delete from core.inquiry_questions where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      const central = await tx<{ id: string }[]>`insert into core.inquiry_questions(workspace_id,task_id,kind,ordinal,question_text,input_type,evidence_outcome,scope_boundary,confirmed_at) values (${scope.workspaceId},${taskId},'central',0,${input.centralQuestion},${input.inputType ?? null},${input.evidenceOutcome ?? null},${input.scopeBoundary ?? null},${input.confirmed ? new Date() : null}) returning id`;
      for (const [index, question] of input.subQuestions.entries()) await tx`insert into core.inquiry_questions(workspace_id,task_id,parent_id,kind,ordinal,question_text,confirmed_at) values (${scope.workspaceId},${taskId},${central[0]!.id},'sub',${index + 1},${question},${input.confirmed ? new Date() : null})`;
      await tx`update core.evidence_claims set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await tx`update core.evidence_relations set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await tx`update core.learning_activities set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await tx`update core.rubric_items set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await revision(tx, scope, taskId, changed, expectedVersion);
    });
  }
  async evidenceMap(scope: WorkspaceScope, taskId: string): Promise<EvidenceMapInput> {
    const task = await this.sql`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if (!task[0]) throw new NotFoundError();
    const claims = await this.sql<Record<string, unknown>[]>`select id,claim_text,gap_accepted from core.evidence_claims where workspace_id=${scope.workspaceId} and task_id=${taskId} order by ordinal`;
    const result: EvidenceMapInput = { claims: [] };
    for (const claim of claims) {
      const relations = await this.sql<Record<string, unknown>[]>`select id,source_version_id,relation_kind,reason from core.evidence_relations where workspace_id=${scope.workspaceId} and task_id=${taskId} and claim_id=${String(claim.id)} order by created_at,id`;
      result.claims.push({ text: String(claim.claim_text), gapAccepted: Boolean(claim.gap_accepted), relations: await Promise.all(relations.map(async (relation) => ({ sourceVersionId: String(relation.source_version_id), kind: String(relation.relation_kind), reason: String(relation.reason), citations: (await this.sql<Record<string, unknown>[]>`select source_version_id,chunk_id,quoted_text from core.evidence_citations where workspace_id=${scope.workspaceId} and task_id=${taskId} and relation_id=${String(relation.id)} order by ordinal`).map((citation) => ({ sourceVersionId: String(citation.source_version_id), chunkId: citation.chunk_id === null ? null : Number(citation.chunk_id), quotedText: citation.quoted_text === null ? null : String(citation.quoted_text) })) }))) });
    }
    return result;
  }
  async putEvidenceMap(scope: WorkspaceScope, taskId: string, expectedVersion: number, input: EvidenceMapInput) {
    await this.sql.begin(async (tx) => {
      const changed = await advance(tx, scope, taskId, expectedVersion); await tx`delete from core.evidence_claims where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      for (const [claimIndex, claim] of input.claims.entries()) {
        const claimRows = await tx<{ id: string }[]>`insert into core.evidence_claims(workspace_id,task_id,claim_text,ordinal,gap_accepted) values (${scope.workspaceId},${taskId},${claim.text},${claimIndex},${claim.gapAccepted}) returning id`;
        for (const relation of claim.relations) {
          const relationRows = await tx<{ id: string }[]>`insert into core.evidence_relations(workspace_id,task_id,claim_id,source_version_id,relation_kind,reason) values (${scope.workspaceId},${taskId},${claimRows[0]!.id},${relation.sourceVersionId},${relation.kind},${relation.reason}) returning id`;
          for (const [citationIndex, citation] of relation.citations.entries()) {
            if (citation.sourceVersionId !== relation.sourceVersionId) throw new Error("CITATION_GATE_FAILED");
            const source = await tx<{ locator: string }[]>`select sv.locator from core.task_sources ts join core.source_versions sv on sv.id=ts.source_version_id where ts.workspace_id=${scope.workspaceId} and ts.task_id=${taskId} and ts.source_version_id=${citation.sourceVersionId}`; if (!source[0]) throw new Error("CITATION_GATE_FAILED");
            if (citation.chunkId !== null) { const match = await tx`select 1 from rag.source_chunks where id=${citation.chunkId} and source_version_id=${citation.sourceVersionId} and position(${citation.quotedText!} in content_text)>0`; if (!match[0]) throw new Error("CITATION_GATE_FAILED"); }
            await tx`insert into core.evidence_citations(workspace_id,task_id,relation_id,source_version_id,chunk_id,locator_text,quoted_text,quote_hash,ordinal) values (${scope.workspaceId},${taskId},${relationRows[0]!.id},${citation.sourceVersionId},${citation.chunkId},${source[0].locator},${citation.quotedText},${citation.quotedText === null ? null : createHash("sha256").update(citation.quotedText).digest("hex")},${citationIndex})`;
          }
        }
      }
      await tx`update core.learning_activities set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await tx`update core.rubric_items set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await revision(tx, scope, taskId, changed, expectedVersion);
    });
  }
  async lessonDesign(scope: WorkspaceScope, taskId: string): Promise<LessonDesignInput> {
    const task = await this.sql`select 1 from core.tasks where workspace_id=${scope.workspaceId} and id=${taskId} and deleted_at is null`; if (!task[0]) throw new NotFoundError();
    const rows = await this.sql<Record<string, unknown>[]>`select id,title,activity_minutes,transition_minutes,student_action,evidence_product,difficulty,scaffold from core.learning_activities where workspace_id=${scope.workspaceId} and task_id=${taskId} order by ordinal`;
    return { activities: await Promise.all(rows.map(async (row) => ({ title: String(row.title), activityMinutes: Number(row.activity_minutes), transitionMinutes: Number(row.transition_minutes), studentAction: String(row.student_action), evidenceProduct: String(row.evidence_product), difficulty: String(row.difficulty), scaffold: String(row.scaffold), sourceVersionIds: (await this.sql<{ source_version_id: string }[]>`select source_version_id from core.activity_sources where workspace_id=${scope.workspaceId} and task_id=${taskId} and activity_id=${String(row.id)} order by source_version_id`).map((item) => item.source_version_id) }))) };
  }
  async putLessonDesign(scope: WorkspaceScope, taskId: string, expectedVersion: number, input: LessonDesignInput) {
    await this.sql.begin(async (tx) => { const changed = await advance(tx, scope, taskId, expectedVersion);
      await tx`delete from core.rubric_activities where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      await tx`delete from core.learning_activities where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      for (const [index, activity] of input.activities.entries()) { const rows = await tx<{ id: string }[]>`insert into core.learning_activities(workspace_id,task_id,ordinal,title,activity_minutes,transition_minutes,student_action,evidence_product,difficulty,scaffold,teacher_edited) values (${scope.workspaceId},${taskId},${index},${activity.title},${activity.activityMinutes},${activity.transitionMinutes},${activity.studentAction},${activity.evidenceProduct},${activity.difficulty},${activity.scaffold},true) returning id`; for (const sourceVersionId of activity.sourceVersionIds) await tx`insert into core.activity_sources(workspace_id,task_id,activity_id,source_version_id) values (${scope.workspaceId},${taskId},${rows[0]!.id},${sourceVersionId})`; }
      await tx`update core.rubric_items set review_state='needs_review',updated_at=now() where workspace_id=${scope.workspaceId} and task_id=${taskId}`; await revision(tx, scope, taskId, changed, expectedVersion);
    });
  }
  async rubric(scope: WorkspaceScope, taskId: string): Promise<RubricInput> {
    const activities = await this.sql<{ id: string; ordinal: number }[]>`select id,ordinal from core.learning_activities where workspace_id=${scope.workspaceId} and task_id=${taskId}`; const ordinalById = new Map(activities.map((item) => [item.id, item.ordinal]));
    const items = await this.sql<Record<string, unknown>[]>`select id,title from core.rubric_items where workspace_id=${scope.workspaceId} and task_id=${taskId} order by ordinal`; return { items: await Promise.all(items.map(async (item) => ({ title: String(item.title), activityOrdinals: (await this.sql<{ activity_id: string }[]>`select activity_id from core.rubric_activities where workspace_id=${scope.workspaceId} and task_id=${taskId} and rubric_item_id=${String(item.id)}`).map((row) => ordinalById.get(row.activity_id)).filter((value): value is number => value !== undefined), levels: (await this.sql<Record<string, unknown>[]>`select level_key,label,description from core.rubric_levels where rubric_item_id=${String(item.id)} order by ordinal`).map((level) => ({ key: String(level.level_key), label: String(level.label), description: String(level.description) })) }))) };
  }
  async putRubric(scope: WorkspaceScope, taskId: string, expectedVersion: number, input: RubricInput) {
    await this.sql.begin(async (tx) => { const changed = await advance(tx, scope, taskId, expectedVersion); const activities = await tx<{ id: string; ordinal: number }[]>`select id,ordinal from core.learning_activities where workspace_id=${scope.workspaceId} and task_id=${taskId}`; const byOrdinal = new Map(activities.map((item) => [item.ordinal, item.id])); await tx`delete from core.rubric_items where workspace_id=${scope.workspaceId} and task_id=${taskId}`;
      for (const [index, item] of input.items.entries()) { const rows = await tx<{ id: string }[]>`insert into core.rubric_items(workspace_id,task_id,ordinal,title,teacher_edited) values (${scope.workspaceId},${taskId},${index},${item.title},true) returning id`; for (const [levelIndex, level] of item.levels.entries()) await tx`insert into core.rubric_levels(rubric_item_id,level_key,ordinal,label,description) values (${rows[0]!.id},${level.key},${levelIndex},${level.label},${level.description})`; for (const ordinal of item.activityOrdinals) { const activityId=byOrdinal.get(ordinal); if (!activityId) throw new Error("INVALID_STATE"); await tx`insert into core.rubric_activities(workspace_id,task_id,rubric_item_id,activity_id) values (${scope.workspaceId},${taskId},${rows[0]!.id},${activityId})`; } }
      await revision(tx, scope, taskId, changed, expectedVersion);
    });
  }
}
