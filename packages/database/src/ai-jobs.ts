import { createHash } from "node:crypto";
import { NotFoundError, type WorkspaceScope } from "@tracepbl/domain";
import type { Database } from "./index.ts";

const purposeMap = { questionGuidance: "question_guidance", sourceAnalysis: "source_analysis", evidenceAnalysis: "evidence_analysis", lesson: "lesson", rubric: "rubric", audit: "audit" } as const;
const promptMap = { questionGuidance: "question-guidance.v1", sourceAnalysis: "source-analysis.v1", evidenceAnalysis: "evidence-analysis.v1", lesson: "lesson.v1", rubric: "rubric.v1", audit: "audit.v1" } as const;
export type ProposalInput = { purpose: keyof typeof purposeMap; baseLockVersion: number; disclosureVersion: "ai-disclosure.v1"; objectIds?: string[] | undefined };
export class AiJobRepository {
  constructor(private readonly sql: Database) {}
  async enqueueProposal(scope: WorkspaceScope, taskId: string, input: ProposalInput, idempotencyKey: string, priceProfileVersion: string, reservedCnyMicros: number) {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    try {
      return await this.sql.begin(async (tx) => {
        const old = await tx<Record<string, unknown>[]>`select request_hash,resource_id,response_summary from ops.command_receipts where workspace_id=${scope.workspaceId} and idempotency_key=${idempotencyKey} for update`;
        if (old[0]) { if (old[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED"); return { jobId: String(old[0].resource_id), modelRunId: String((old[0].response_summary as Record<string, unknown>).modelRunId) }; }
        const rows = await tx<{ job_id: string; model_run_id: string }[]>`select * from ops.enqueue_model_job(${scope.workspaceId},${taskId},${input.baseLockVersion},${purposeMap[input.purpose]},${promptMap[input.purpose]},${requestHash},${idempotencyKey},${tx.json({ purpose: input.purpose, baseLockVersion: input.baseLockVersion, objectIds: input.objectIds ?? [] })},${priceProfileVersion},${reservedCnyMicros})`;
        if (!rows[0]) throw new NotFoundError();
        await tx`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status,resource_kind,resource_id,response_summary) values (${scope.workspaceId},${taskId},${idempotencyKey},'create_proposal',${requestHash},'succeeded','job',${rows[0].job_id},${tx.json({ modelRunId: rows[0].model_run_id })})`;
        return { jobId: rows[0].job_id, modelRunId: rows[0].model_run_id };
      });
    } catch (error) {
      const message = (error as Error).message;
      if (["VERSION_CONFLICT", "BUDGET_EXCEEDED", "INVALID_STATE"].includes(message)) throw new Error(message);
      throw error;
    }
  }
  async proposal(scope: WorkspaceScope, taskId: string, revisionId: string) {
    const rows = await this.sql<Record<string, unknown>[]>`select tr.id,tr.base_lock_version,tr.snapshot,mr.purpose from core.task_revisions tr join rag.model_runs mr on mr.output_task_revision_id=tr.id and mr.workspace_id=tr.workspace_id and mr.task_id=tr.task_id where tr.workspace_id=${scope.workspaceId} and tr.task_id=${taskId} and tr.id=${revisionId} and tr.reason='generated'`;
    if (!rows[0]) throw new NotFoundError(); return rows[0];
  }
}
