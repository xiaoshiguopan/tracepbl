import { createHash } from "node:crypto";
import { Command } from "@langchain/langgraph";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { z } from "zod";
import { buildPrompt, buildProposalGraph, type AiProvider } from "@tracepbl/ai";
import { EvidenceMapSchema,LessonDesignSchema,QuestionSetSchema,RubricSchema } from "@tracepbl/contracts";
import { chunkSource, fetchPublicText, selectContext, validateCitation } from "@tracepbl/retrieval";
import type { Database, JobRepository, JobRow } from "@tracepbl/repositories";
import { WorkerFailure, type JobHandler } from "./runner.ts";

const modelOutput = z.object({ proposal: z.record(z.string(), z.unknown()), citations: z.array(z.object({ hitRank: z.number().int().positive(), quotedText: z.string().min(1).max(2000) }).strict()).max(30) }).strict();
type HandlerOptions = { sql: Database; jobs: JobRepository; provider: AiProvider; checkpointer: PostgresSaver; urlFetchEnabled: boolean; actualCostMicros: (inputTokens: number, outputTokens: number) => number };

export function createHandlers(options: HandlerOptions): Record<string, JobHandler> {
  return {
    source_check: (job, signal) => { if(!options.urlFetchEnabled) throw new WorkerFailure("PROVIDER_UNAVAILABLE"); return sourceCheck(options.sql, job, signal); },
    embedding: (job, signal) => embedSource(options.sql, options.provider, job, signal),
    model: (job, signal) => modelProposal(options, job, signal),
    purge: (job, signal) => purgeTask(options.sql, options.checkpointer, job, signal),
    audit: (job) => runAudit(options.sql, job),
    export: (job) => prepareExport(options.sql, job),
  };
}

async function sourceCheck(sql: Database, job: JobRow, signal: AbortSignal) {
  const sourceVersionId = requireString(job.payload.sourceVersionId);
  const rows = await sql<Record<string, unknown>[]>`select sv.*,s.canonical_url,s.id as source_id from core.source_versions sv join core.sources s on s.id=sv.source_id where sv.id=${sourceVersionId} and s.workspace_id=${job.workspaceId} and s.task_id=${job.taskId} and s.material_kind='url'`;
  if (!rows[0]?.canonical_url) throw new WorkerFailure("RESOURCE_NOT_FOUND");
  const fetched = await fetchPublicText(String(rows[0].canonical_url), signal);
  const contentHash = createHash("sha256").update(fetched.text).digest("hex");
  await sql.begin(async (tx) => {
    let version = await tx<{ id: string }[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,accessed_at,content_text,rights_state,rights_basis,verification_state,content_hash)
      values (${String(rows[0]!.source_id)},${Number(rows[0]!.version_no)+1},${fetched.title ?? String(rows[0]!.creator_or_institution)},'网页',${fetched.finalUrl},now(),${fetched.text},${String(rows[0]!.rights_state)},${String(rows[0]!.rights_basis)},'conditional',${contentHash}) on conflict(source_id,content_hash) do nothing returning id`;
    if(!version[0]) version=await tx<{id:string}[]>`select id from core.source_versions where source_id=${String(rows[0]!.source_id)} and content_hash=${contentHash}`;
    const idempotency = `${job.id}:embedding`;
    const next = await tx<{ id: string }[]>`insert into ops.jobs(workspace_id,task_id,job_kind,idempotency_key,payload) values (${job.workspaceId},${job.taskId},'embedding',${idempotency},${tx.json({ sourceVersionId: version[0]!.id })}) on conflict(workspace_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id`;
    await tx`insert into ops.job_events(workspace_id,task_id,job_id,event_type,payload) values (${job.workspaceId},${job.taskId},${next[0]!.id},'operation.queued',${tx.json({ operationId: next[0]!.id, kind: "embedding", attempt: 0, canCancel: true })})`;
  });
}

async function reserveEmbedding(sql: Database, job: JobRow, tokens: number) {
  return sql.begin(async (tx) => {
    const usageDay = await tx<{ day: string }[]>`select (now() at time zone 'Asia/Shanghai')::date::text as day`; const day=usageDay[0]!.day;
    await tx`select pg_advisory_xact_lock(hashtextextended(${job.workspaceId+day},0))`;
    const used = await tx<{ tokens: number }[]>`select coalesce(sum(case when status='reserved' then reserved_tokens when status='settled' then actual_tokens else 0 end),0)::int as tokens from ops.usage_ledger where workspace_id=${job.workspaceId} and usage_day=${day}::date and usage_kind='embedding'`;
    if (Number(used[0]?.tokens ?? 0)+tokens>200000) throw new WorkerFailure("BUDGET_EXCEEDED");
    await tx`insert into ops.usage_ledger(workspace_id,task_id,job_id,usage_day,usage_kind,status,reserved_tokens) values (${job.workspaceId},${job.taskId},${job.id},${day}::date,'embedding','reserved',${tokens}) on conflict(workspace_id,job_id,usage_kind) do nothing`;
  });
}
async function settleEmbedding(sql:Database,job:JobRow,calls:number,tokens:number){const rows=await sql`update ops.usage_ledger set status='settled',actual_calls=${calls},actual_tokens=${tokens},actual_cny_micros=0,updated_at=now() where workspace_id=${job.workspaceId} and task_id=${job.taskId} and job_id=${job.id} and usage_kind='embedding' and status='reserved' and ${tokens}<=reserved_tokens returning id`;if(!rows[0])throw new WorkerFailure("BUDGET_EXCEEDED");}

async function embedSource(sql: Database, provider: AiProvider, job: JobRow, signal: AbortSignal) {
  const sourceVersionId=requireString(job.payload.sourceVersionId); const source=await sql<{ content_text:string; rights_state:string }[]>`select sv.content_text,sv.rights_state from core.source_versions sv join core.sources s on s.id=sv.source_id where sv.id=${sourceVersionId} and sv.content_text is not null and sv.rights_state not in ('restricted_metadata_only','not_allowed') and ((s.workspace_id=${job.workspaceId} and s.task_id=${job.taskId}) or exists(select 1 from core.task_sources ts where ts.workspace_id=${job.workspaceId} and ts.task_id=${job.taskId} and ts.source_version_id=sv.id))`;
  if(!source[0]) throw new WorkerFailure("RESOURCE_NOT_FOUND"); const chunks=chunkSource(source[0].content_text); const predicted=chunks.reduce((sum,item)=>sum+Array.from(item.contentText).length,0); await reserveEmbedding(sql,job,predicted);
  const profile=await sql<{id:string}[]>`select id from rag.embedding_profiles where provider='zhipu' and model='embedding-3' and dimensions=1024 and distance='cosine' and chunker_version='chunk-v1' and active order by created_at desc,id desc limit 1`; if(!profile[0]) throw new WorkerFailure("INVALID_STATE");
  let actualTokens=0;let actualCalls=0;
  for(let offset=0;offset<chunks.length;offset+=64){ const batch=chunks.slice(offset,offset+64); const embedded=await provider.embed(batch.map((item)=>item.contentText),signal);actualCalls+=1;actualTokens+=embedded.inputTokens; await sql.begin(async(tx)=>{ for(const [index,chunk] of batch.entries()){ const stored=await tx<{id:number}[]>`insert into rag.source_chunks(source_version_id,ordinal,content_text,char_start,char_end,locator,content_hash) values (${sourceVersionId},${chunk.ordinal},${chunk.contentText},${chunk.charStart},${chunk.charEnd},${tx.json({charStart:chunk.charStart,charEnd:chunk.charEnd})},${chunk.contentHash}) on conflict(source_version_id,content_hash) do update set source_version_id=excluded.source_version_id returning id`; await tx.unsafe("insert into rag.chunk_embeddings(chunk_id,embedding_profile_id,embedding) values ($1,$2,$3::vector) on conflict(chunk_id,embedding_profile_id) do nothing",[stored[0]!.id,profile[0]!.id,`[${embedded.vectors[index]!.join(",")}]`]); }}); }
  await settleEmbedding(sql,job,actualCalls,actualTokens);
}

async function modelProposal(options: HandlerOptions, job: JobRow, signal: AbortSignal): Promise<void | "managed"> {
  // A previous, unadopted generation is history, not a complete teacher input.
  // Resolve only within the revision boundary frozen when this job was enqueued.
  if (job.modelRunId && !job.payload.decisionId) await options.sql`update rag.model_runs mr set task_revision_id=(
    select saved.id from core.task_revisions saved join core.task_revisions frozen on frozen.id=mr.task_revision_id
    where saved.workspace_id=mr.workspace_id and saved.task_id=mr.task_id and frozen.workspace_id=mr.workspace_id and frozen.task_id=mr.task_id
      and saved.reason<>'generated' and saved.revision_no<=frozen.revision_no order by saved.revision_no desc limit 1)
    where mr.workspace_id=${job.workspaceId} and mr.task_id=${job.taskId} and mr.id=${job.modelRunId} and mr.status='queued'
      and exists(select 1 from core.task_revisions tr where tr.id=mr.task_revision_id and tr.reason='generated')`;
  if(!job.modelRunId) throw new WorkerFailure("INVALID_STATE"); const run=await options.sql<Record<string,unknown>[]>`select mr.*,tr.snapshot from rag.model_runs mr join core.task_revisions tr on tr.id=mr.task_revision_id where mr.workspace_id=${job.workspaceId} and mr.task_id=${job.taskId} and mr.id=${job.modelRunId}`; if(!run[0]) throw new WorkerFailure("RESOURCE_NOT_FOUND");
  const threadId=requireString(run[0].external_thread_id); const config={configurable:{thread_id:threadId}}; let generatedRevisionId="";
  const graph=buildProposalGraph({
    freeze:async()=>({frozen:true}),
    retrieve:async()=>{ if(job.payload.purpose==="questionGuidance"){if(!(run[0]!.snapshot as Record<string,unknown>).context)throw new WorkerFailure("INVALID_STATE");return {retrievalHitIds:[]};} const query=JSON.stringify(run[0]!.snapshot); await reserveEmbedding(options.sql,job,Array.from(query).length); const queryEmbedding=await options.provider.embed([query],signal);await settleEmbedding(options.sql,job,1,queryEmbedding.inputTokens);const vector=`[${queryEmbedding.vectors[0]!.join(",")}]`; const candidates=await options.sql<Record<string,unknown>[]>`select sc.id as chunk_id,sc.source_version_id,sc.content_text,(ce.embedding <=> ${vector}::vector) as distance from core.task_sources ts join core.source_versions sv on sv.id=ts.source_version_id join rag.source_chunks sc on sc.source_version_id=sv.id join rag.chunk_embeddings ce on ce.chunk_id=sc.id join rag.embedding_profiles ep on ep.id=ce.embedding_profile_id where ts.workspace_id=${job.workspaceId} and ts.task_id=${job.taskId} and sv.rights_state not in ('restricted_metadata_only','not_allowed') and ep.id=(select id from rag.embedding_profiles where provider='zhipu' and model='embedding-3' and dimensions=1024 and distance='cosine' and chunker_version='chunk-v1' and active order by created_at desc,id desc limit 1) order by ce.embedding <=> ${vector}::vector limit 24`;
      const selected=selectContext(candidates.map((row)=>({sourceVersionId:String(row.source_version_id),chunkId:Number(row.chunk_id),cosineDistance:Number(row.distance),keywordScore:0}))); if(!selected.length) throw new WorkerFailure("EVIDENCE_INSUFFICIENT");
      await options.sql.begin(async(tx)=>{ await tx`delete from rag.retrieval_hits where model_run_id=${job.modelRunId!}`; for(const [index,candidate] of candidates.entries()) await tx`insert into rag.retrieval_hits(workspace_id,task_id,model_run_id,source_version_id,chunk_id,rank,cosine_distance,keyword_score,selected_for_context) values (${job.workspaceId},${job.taskId},${job.modelRunId!},${String(candidate.source_version_id)},${Number(candidate.chunk_id)},${index+1},${Number(candidate.distance)},0,${selected.some((hit)=>hit.chunkId===Number(candidate.chunk_id))})`; });
      return {retrievalHitIds:selected.map((hit)=>String(hit.chunkId))}; },
    generateOnce:async()=>{ await options.sql`update rag.model_runs set status='running',started_at=coalesce(started_at,now()) where id=${job.modelRunId!} and status='queued'`; const hits=await options.sql<Record<string,unknown>[]>`select rh.rank,rh.chunk_id,rh.source_version_id,sc.content_text from rag.retrieval_hits rh join rag.source_chunks sc on sc.id=rh.chunk_id and sc.source_version_id=rh.source_version_id where rh.model_run_id=${job.modelRunId!} and rh.selected_for_context order by rh.rank`; const purpose=requireString(job.payload.purpose) as keyof typeof import("@tracepbl/ai").promptTemplates; const prompt=buildPrompt(purpose,JSON.stringify(run[0]!.snapshot),hits.map((hit)=>`HIT-${hit.rank}: ${hit.content_text}`)); const result=await options.provider.generateStructured({schema:modelOutput,system:prompt.system,input:prompt.input,maxOutputTokens:4000,signal});const proposalSchemas={questionGuidance:QuestionSetSchema,evidenceAnalysis:EvidenceMapSchema,lesson:LessonDesignSchema,rubric:RubricSchema};const proposalSchema=proposalSchemas[purpose as keyof typeof proposalSchemas];if(proposalSchema&&!proposalSchema.safeParse(result.value.proposal).success)throw new WorkerFailure("PROVIDER_OUTPUT_INVALID");for(const citation of result.value.citations){ const hit=hits.find((item)=>Number(item.rank)===citation.hitRank); if(!hit||!validateCitation({modelRunId:job.modelRunId!,taskId:job.taskId,sourceVersionId:String(hit.source_version_id),chunkId:Number(hit.chunk_id),quotedText:citation.quotedText},{modelRunId:job.modelRunId!,taskId:job.taskId,sourceVersionId:String(hit.source_version_id),chunkId:Number(hit.chunk_id),contentText:String(hit.content_text),selectedForContext:true})) throw new WorkerFailure("CITATION_GATE_FAILED"); }
      const snapshot={purpose,modelRunId:job.modelRunId,proposal:result.value.proposal,citations:result.value.citations}; const snapshotJson=JSON.parse(JSON.stringify(snapshot)) as Parameters<typeof options.sql.json>[0]; const revision=await options.sql<{revision_id:string|null}[]>`select ops.commit_generated_revision(${job.id},${job.leaseToken!},${options.sql.json(snapshotJson)},${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")},${result.actualModel},${result.usage.inputTokens},${result.usage.outputTokens},${result.usage.totalTokens},${options.actualCostMicros(result.usage.inputTokens,result.usage.outputTokens)}) as revision_id`; if(!revision[0]?.revision_id){ await options.jobs.finish(job.id,job.leaseToken!,"stale","RESULT_STALE"); throw new WorkerFailure("RESULT_STALE"); } generatedRevisionId=revision[0].revision_id; return {modelRunId:job.modelRunId!,generatedRevisionId}; },
    validate:async()=>({validated:true}),
  },options.checkpointer);
  if(job.payload.decisionId){ await graph.invoke(new Command({resume:requireString(job.payload.decisionId)}),config); return; }
  const result=await graph.invoke({taskId:job.taskId,inputLockVersion:Number(job.payload.baseLockVersion),frozen:false,retrievalHitIds:[],modelRunId:job.modelRunId,generatedRevisionId:"",validated:false,decisionId:""},config) as Record<string,unknown>; if(!Array.isArray(result.__interrupt__)) throw new WorkerFailure("INVALID_STATE");
  if(!generatedRevisionId) { const current=await options.sql<{output_task_revision_id:string}[]>`select output_task_revision_id from rag.model_runs where id=${job.modelRunId}`; generatedRevisionId=current[0]!.output_task_revision_id; }
  if(!(await options.jobs.pauseForTeacher(job.id,job.leaseToken!,generatedRevisionId))) throw new WorkerFailure("LEASE_LOST"); return "managed";
}

async function runAudit(sql:Database,job:JobRow){
  const lock=Number(job.payload.baseLockVersion);const runId=requireString(job.payload.runId);
  await sql`update core.verification_runs set status='running',started_at=coalesce(started_at,now()) where workspace_id=${job.workspaceId} and task_id=${job.taskId} and id=${runId} and status='queued'`;
  const current=await sql<{lock_version:number}[]>`select lock_version from core.tasks where workspace_id=${job.workspaceId} and id=${job.taskId} and deleted_at is null`;
  if(Number(current[0]?.lock_version)!==lock)throw new WorkerFailure("RESULT_STALE");
  const findings:Array<{severity:string;category:string;subjectKind:string;subjectId:string|null;title:string;basis:string;impact:string;recommendation:string}>=[];
  const missing = await sql<{section:string}[]>`select '教学情境' as section where not exists(select 1 from core.task_contexts where workspace_id=${job.workspaceId} and task_id=${job.taskId})
    union all select '已确认问题' where not exists(select 1 from core.inquiry_questions where workspace_id=${job.workspaceId} and task_id=${job.taskId} and kind='central' and confirmed_at is not null)
    union all select '证据关系' where not exists(select 1 from core.evidence_claims where workspace_id=${job.workspaceId} and task_id=${job.taskId})
    union all select '课堂活动' where not exists(select 1 from core.learning_activities where workspace_id=${job.workspaceId} and task_id=${job.taskId})
    union all select '评价量规' where not exists(select 1 from core.rubric_items where workspace_id=${job.workspaceId} and task_id=${job.taskId})`;
  for (const item of missing) findings.push({severity:"blocking",category:"completeness",subjectKind:"task",subjectId:null,title:`缺少${item.section}`,basis:"当前修订缺少必需备课内容。",impact:"不能签发不完整教学包。",recommendation:"回到对应步骤补齐并确认。"});
  const reviews = await sql`select 1 from core.inquiry_questions where workspace_id=${job.workspaceId} and task_id=${job.taskId} and review_state='needs_review'
    union all select 1 from core.task_sources where workspace_id=${job.workspaceId} and task_id=${job.taskId} and review_state='needs_review'
    union all select 1 from core.evidence_claims where workspace_id=${job.workspaceId} and task_id=${job.taskId} and review_state='needs_review'
    union all select 1 from core.evidence_relations where workspace_id=${job.workspaceId} and task_id=${job.taskId} and review_state='needs_review'
    union all select 1 from core.learning_activities where workspace_id=${job.workspaceId} and task_id=${job.taskId} and review_state='needs_review'
    union all select 1 from core.rubric_items where workspace_id=${job.workspaceId} and task_id=${job.taskId} and review_state='needs_review'`;
  if (reviews.length) findings.push({severity:"blocking",category:"completeness",subjectKind:"task",subjectId:null,title:"上游变化尚未复核",basis:"服务器记录存在待复核分项。",impact:"旧内容不能直接签发。",recommendation:"依次检查并保存受影响的分项。"});
  const uncovered = await sql<{id:string;gap_accepted:boolean}[]>`select ec.id,ec.gap_accepted from core.evidence_claims ec where ec.workspace_id=${job.workspaceId} and ec.task_id=${job.taskId} and not exists(select 1 from core.evidence_relations er where er.workspace_id=ec.workspace_id and er.task_id=ec.task_id and er.claim_id=ec.id)`;
  for (const item of uncovered) findings.push({severity:item.gap_accepted?"teacher_confirmation":"blocking",category:"evidence",subjectKind:"evidence_claim",subjectId:item.id,title:"判断缺少支持材料",basis:item.gap_accepted?"教师已标记缺口，仍须在终审前确认教学处理。":"该判断没有证据关系。",impact:"不能把缺少依据的判断当成结论。",recommendation:"补充材料，或明确说明课堂中如何处理证据不足。"});
  const unaligned = await sql`select 1 from core.rubric_items ri where ri.workspace_id=${job.workspaceId} and ri.task_id=${job.taskId} and not exists(select 1 from core.rubric_activities ra where ra.workspace_id=ri.workspace_id and ra.task_id=ri.task_id and ra.rubric_item_id=ri.id)
    union all select 1 from core.learning_activities la where la.workspace_id=${job.workspaceId} and la.task_id=${job.taskId} and not exists(select 1 from core.activity_sources a where a.workspace_id=la.workspace_id and a.task_id=la.task_id and a.activity_id=la.id)`;
  if (unaligned.length) findings.push({severity:"blocking",category:"alignment",subjectKind:"task",subjectId:null,title:"活动、来源与评价尚未对齐",basis:"活动缺少来源，或评价维度未关联课堂活动。",impact:"无法验证课堂成果与评价依据。",recommendation:"补齐活动来源及评价关联。"});
  const selected=await sql<{source_version_id:string;rights_state:string;verification_state:string}[]>`select ts.source_version_id,sv.rights_state,sv.verification_state from core.task_sources ts join core.source_versions sv on sv.id=ts.source_version_id where ts.workspace_id=${job.workspaceId} and ts.task_id=${job.taskId}`;
  if(selected.length===0)findings.push({severity:"blocking",category:"evidence",subjectKind:"task",subjectId:null,title:"尚未选择来源",basis:"任务没有已选来源。",impact:"无法形成可追溯证据链。",recommendation:"至少选择一项可核验来源。"});
  for(const item of selected)if(!["verified_reusable","restricted_metadata_only"].includes(item.rights_state)||!["verified","conditional"].includes(item.verification_state))findings.push({severity:"unknown",category:"rights",subjectKind:"source_version",subjectId:item.source_version_id,title:"来源权利或核验状态仍未知",basis:`rights=${item.rights_state}; verification=${item.verification_state}`,impact:"不能签发或导出。",recommendation:"补充权利依据并完成来源核验。"});
  for(const item of selected)if(item.rights_state==="restricted_metadata_only"&&["verified","conditional"].includes(item.verification_state))findings.push({severity:"teacher_confirmation",category:"rights",subjectKind:"source_version",subjectId:item.source_version_id,title:"受限来源仅输出元数据",basis:"来源权利仅允许元数据展示。",impact:"导出不包含材料正文或引文。",recommendation:"核对安全替代内容后确认；需要正文时更换可复用来源。"});
  for(const item of selected)if(item.verification_state==="conditional"&&item.rights_state==="verified_reusable")findings.push({severity:"teacher_confirmation",category:"rights",subjectKind:"source_version",subjectId:item.source_version_id,title:"有条件可用来源需要确认",basis:"来源尚有明确使用条件。",impact:"不可视为无条件核验通过。",recommendation:"核对来源局限并记录本课使用理由。"});
  const gaps=await sql<{id:string}[]>`select er.id from core.evidence_relations er join core.evidence_claims ec on ec.workspace_id=er.workspace_id and ec.task_id=er.task_id and ec.id=er.claim_id where er.workspace_id=${job.workspaceId} and er.task_id=${job.taskId} and ec.gap_accepted=false and not exists(select 1 from core.evidence_citations ci where ci.workspace_id=er.workspace_id and ci.task_id=er.task_id and ci.relation_id=er.id)`;
  for(const gap of gaps)findings.push({severity:"blocking",category:"citation",subjectKind:"evidence_relation",subjectId:gap.id,title:"证据关系缺少引用",basis:"该关系未绑定可追溯引文。",impact:"读者无法复核证据依据。",recommendation:"补充准确引用，或由教师明确接受缺口。"});
  const timing=await sql<{planned:number;minutes:number|null}[]>`select coalesce((select sum(activity_minutes+transition_minutes)::int from core.learning_activities where workspace_id=${job.workspaceId} and task_id=${job.taskId}),0) as planned,(select minutes from core.task_contexts where workspace_id=${job.workspaceId} and task_id=${job.taskId}) as minutes`;
  if(timing[0]?.minutes!==null&&timing[0]?.minutes!==undefined&&timing[0].planned!==timing[0].minutes)findings.push({severity:timing[0].planned>timing[0].minutes?"blocking":"teacher_confirmation",category:"feasibility",subjectKind:"task",subjectId:null,title:"课时合计与教学情境不一致",basis:`计划 ${timing[0].planned} 分钟，情境 ${timing[0].minutes} 分钟。`,impact:"课堂节奏可能无法按计划完成。",recommendation:"调整活动时间或确认例外。"});
  await sql.begin(async tx=>{
    const fence=await tx<{valid:boolean}[]>`select ops.lock_audit_commit(${job.id},${job.leaseToken!},${runId},${lock}) as valid`;
    if(!fence[0]?.valid)throw new WorkerFailure("RESULT_STALE");
    await tx`delete from core.verification_findings where workspace_id=${job.workspaceId} and task_id=${job.taskId} and run_id=${runId}`;
    for(const finding of findings)await tx`insert into core.verification_findings(workspace_id,task_id,run_id,severity,category,subject_kind,subject_id,title,basis,impact,recommendation) values (${job.workspaceId},${job.taskId},${runId},${finding.severity},${finding.category},${finding.subjectKind},${finding.subjectId},${finding.title},${finding.basis},${finding.impact},${finding.recommendation})`;
    const summary={blocking:findings.filter(item=>item.severity==="blocking").length,unknown:findings.filter(item=>item.severity==="unknown").length,teacherConfirmation:findings.filter(item=>item.severity==="teacher_confirmation").length,pass:findings.length===0};
    const completed=await tx`update core.verification_runs set status='succeeded',completed_at=now(),summary=${tx.json(summary)} where workspace_id=${job.workspaceId} and task_id=${job.taskId} and id=${runId} and status='running' returning id`;
    if(!completed[0])throw new WorkerFailure("RESULT_STALE");
  });
}
async function prepareExport(sql:Database,job:JobRow){ const exportId=requireString(job.payload.exportId);const rows=await sql<{revision_id:string|null}[]>`select ops.complete_export(${job.id},${job.leaseToken!},${exportId},${Number(job.payload.baseLockVersion)}) as revision_id`;if(!rows[0]?.revision_id)throw new WorkerFailure("RESULT_STALE"); }
async function purgeTask(sql:Database,checkpointer:PostgresSaver,job:JobRow,signal:AbortSignal):Promise<"managed">{ const task=await sql`select 1 from core.tasks where workspace_id=${job.workspaceId} and id=${job.taskId} and deleted_at is not null and purge_after<=now()`; if(!task[0]) throw new WorkerFailure("INVALID_STATE"); const threads=await sql<{external_thread_id:string}[]>`select external_thread_id from rag.model_runs where workspace_id=${job.workspaceId} and task_id=${job.taskId} and external_thread_id is not null`; try { for(const item of threads){ if(signal.aborted) throw new WorkerFailure("CANCELLED"); await checkpointer.deleteThread(item.external_thread_id); } } catch(error) { if(error instanceof WorkerFailure) throw error; throw new WorkerFailure("CHECKPOINT_DELETE_FAILED",true); } const removed=await sql<{purged:boolean}[]>`select ops.purge_task(${job.id},${job.leaseToken!}) as purged`;if(!removed[0]?.purged)throw new WorkerFailure("LEASE_LOST");return "managed"; }
function requireString(value:unknown){if(typeof value!=="string"||!value) throw new WorkerFailure("INVALID_JOB_PAYLOAD");return value;}
