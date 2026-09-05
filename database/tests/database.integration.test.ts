import postgres, { type Sql } from "postgres";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../scripts/database.js";
import { ContentRepository, SourceRepository, TaskRepository, WorkflowRepository } from "@tracepbl/repositories";

const image = "pgvector/pgvector:0.8.6-pg18-bookworm";
let container: StartedTestContainer;
let sql: Sql;
const workspaceA = "01990000-0000-7000-8000-000000000011";
const workspaceB = "01990000-0000-7000-8000-000000000012";
const taskA = "01990000-0000-7000-8000-000000000021";
const taskB = "01990000-0000-7000-8000-000000000022";

beforeAll(async () => {
  const externalUrl = process.env.TRACEPBL_TEST_DATABASE_URL;
  if (externalUrl) {
    sql = postgres(externalUrl, { max: 4, onnotice: () => undefined });
  } else {
    container = await new GenericContainer(image)
      .withEnvironment({ POSTGRES_DB: "tracepbl", POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/).withStartupTimeout(120_000))
      .start();
    sql = postgres({ host: container.getHost(), port: container.getMappedPort(5432), database: "tracepbl", username: "postgres", password: "postgres", max: 4, onnotice: () => undefined });
  }
  await applyMigrations(sql);
  await sql`insert into core.workspaces(id,display_name) values (${workspaceA},'合成测试 A'),(${workspaceB},'合成测试 B')`;
  await sql`insert into core.tasks(id,workspace_id,title) values (${taskA},${workspaceA},'合成任务 A'),(${taskB},${workspaceB},'合成任务 B')`;
}, 180_000);

afterAll(async () => {
  if (sql) await sql.end();
  if (container) await container.stop();
});

describe("PostgreSQL 18 and pgvector migrations", () => {
  it("replays idempotently with exact runtime versions", async () => {
    await applyMigrations(sql);
    const [versions] = await sql<{ pg: string; vector: string }[]>`
      select current_setting('server_version_num') as pg, (select extversion from pg_extension where extname='vector') as vector`;
    expect(versions?.pg.startsWith("18")).toBe(true);
    expect(versions?.vector).toBe("0.8.6");
    const relations = await sql<{ count: number }[]>`select count(*)::int as count from pg_tables where schemaname in ('core','rag','ops')`;
    expect(relations[0]?.count).toBe(33); // CP-12-01 adds two recovery relations.
    const seedCount = await sql<{ count: number }[]>`select count(*)::int as count from core.workspaces where id='01990000-0000-7000-8000-000000000001'`;
    expect(seedCount[0]?.count).toBe(1);
  });

  it("rejects a task-private source selected by another task", async () => {
    const [source] = await sql<{ id: string }[]>`insert into core.sources(scope,workspace_id,task_id,material_kind,title,data_class) values ('task_private',${workspaceA},${taskA},'text','合成材料（非史料）','synthetic') returning id`;
    const [version] = await sql<{ id: string }[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash) values (${source!.id},1,'合成测试','测试文本','测试定位','仅用于数据库约束测试','verified_reusable','合成测试','conditional',${"a".repeat(64)}) returning id`;
    await expect(sql`insert into core.task_sources(workspace_id,task_id,source_version_id,selection_order) values (${workspaceB},${taskB},${version!.id},0)`).rejects.toMatchObject({ code: "23514" });
  });

  it("uses optimistic locking without partial overwrite", async () => {
    const first = await sql`update core.tasks set title='先到写入',lock_version=lock_version+1 where workspace_id=${workspaceA} and id=${taskA} and lock_version=0 returning id`;
    const stale = await sql`update core.tasks set title='过期写入',lock_version=lock_version+1 where workspace_id=${workspaceA} and id=${taskA} and lock_version=0 returning id`;
    expect(first).toHaveLength(1);
    expect(stale).toHaveLength(0);
  });

  it("enforces the 24-hour delete window and supports a conditional undo", async () => {
    const deletedAt = new Date(Date.now()-3_600_000);
    await sql`update core.tasks set deleted_at=${deletedAt},purge_after=${new Date(deletedAt.getTime()+86_400_000)},lock_version=lock_version+1 where id=${taskA}`;
    const visible = await sql`select id from core.tasks where workspace_id=${workspaceA} and id=${taskA} and deleted_at is null`;
    expect(visible).toHaveLength(0);
    await expect(sql`update core.tasks set purge_after=${deletedAt} where id=${taskA}`).rejects.toMatchObject({ code: "23514" });
    await sql`update core.tasks set deleted_at=null,purge_after=null,lock_version=lock_version+1 where id=${taskA} and purge_after>now()`;
  });

  it("returns exact cosine order and stores no ANN index", async () => {
    const [source] = await sql<{ id: string }[]>`insert into core.sources(scope,material_kind,title,data_class) values ('catalog','catalog','公开合成目录占位','synthetic') returning id`;
    const [version] = await sql<{ id: string }[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash) values (${source!.id},1,'合成测试','测试文本','测试定位','测试文本','verified_reusable','合成测试','verified',${"b".repeat(64)}) returning id`;
    const [chunkA] = await sql<{ id: number }[]>`insert into rag.source_chunks(source_version_id,ordinal,content_text,locator,content_hash) values (${version!.id},0,'甲',${sql.json({ paragraph: 1 })},${"c".repeat(64)}) returning id`;
    const [chunkB] = await sql<{ id: number }[]>`insert into rag.source_chunks(source_version_id,ordinal,content_text,locator,content_hash) values (${version!.id},1,'乙',${sql.json({ paragraph: 2 })},${"d".repeat(64)}) returning id`;
    const profile = "01990000-0000-7000-8000-000000000002";
    const unit = [1, ...Array<number>(1023).fill(0)];
    const orthogonal = [0, 1, ...Array<number>(1022).fill(0)];
    await sql.unsafe(`insert into rag.chunk_embeddings(chunk_id,embedding_profile_id,embedding) values ($1,$2,$3::vector),($4,$2,$5::vector)`, [chunkA!.id, profile, `[${unit.join(",")}]`, chunkB!.id, `[${orthogonal.join(",")}]`]);
    const hits = await sql<{ chunk_id: number }[]>`select chunk_id from rag.chunk_embeddings where embedding_profile_id=${profile} and chunk_id in (${chunkA!.id},${chunkB!.id}) order by embedding <=> ${`[${unit.join(",")}]`}::vector limit 2`;
    expect(hits.map((hit) => Number(hit.chunk_id))).toEqual([Number(chunkA!.id), Number(chunkB!.id)]);
    const ann = await sql`select 1 from pg_indexes where schemaname='rag' and indexdef ~* '(hnsw|ivfflat)'`;
    expect(ann).toHaveLength(0);
  });

  it("denies schema changes and immutable-history writes to runtime roles", async () => {
    let deniedDdl = false;
    await sql.begin(async (tx) => {
      await tx`set local role tracepbl_app`;
      try { await tx`create table core.forbidden(id integer)`; } catch (error) { deniedDdl = (error as { code?: string }).code === "42501"; throw error; }
    }).catch(() => undefined);
    let deniedHistory = false;
    await sql.begin(async (tx) => {
      await tx`set local role tracepbl_app`;
      try { await tx`update core.source_versions set locator='篡改'`; } catch (error) { deniedHistory = (error as { code?: string }).code === "42501"; throw error; }
    }).catch(() => undefined);
    let deniedDecision = false;
    await sql.begin(async (tx) => {
      await tx`set local role tracepbl_worker`;
      try { await tx`insert into core.teacher_decisions(workspace_id,task_id,task_revision_id,decision_kind) values (${workspaceA},${taskA},gen_random_uuid(),'approve')`; } catch (error) { deniedDecision = (error as { code?: string }).code === "42501"; throw error; }
    }).catch(() => undefined);
    expect({ deniedDdl, deniedHistory, deniedDecision }).toEqual({ deniedDdl: true, deniedHistory: true, deniedDecision: true });
  });

  it("limits worker deletion to retryable audit findings",async()=>{const run=await sql<{id:string}[]>`insert into core.verification_runs(workspace_id,task_id,run_kind,input_lock_version,status) values (${workspaceA},${taskA},'design_audit',0,'running') returning id`;const finding=await sql<{id:string}[]>`insert into core.verification_findings(workspace_id,task_id,run_id,severity,category,subject_kind,title,basis,impact) values (${workspaceA},${taskA},${run[0]!.id},'suggestion','synthetic','task','合成建议','合成依据','合成影响') returning id`;await sql.begin(async tx=>{await tx`set local role tracepbl_worker`;expect(await tx`delete from core.verification_findings where workspace_id=${workspaceA} and task_id=${taskA} and run_id=${run[0]!.id}`).toHaveProperty("count",1);await expect(tx`delete from core.tasks where workspace_id=${workspaceA} and id=${taskA}`).rejects.toMatchObject({code:"42501"});}).catch(error=>{if((error as {code?:string}).code!=="42501")throw error;});expect(finding[0]?.id).toBeTruthy();await sql`delete from core.verification_runs where id=${run[0]!.id}`;});

  it("rejects chunking metadata-only content", async () => {
    const [source] = await sql<{ id: string }[]>`insert into core.sources(scope,material_kind,title,data_class) values ('catalog','catalog','受限元数据占位','public_unknown') returning id`;
    const [version] = await sql<{ id: string }[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,rights_state,rights_basis,verification_state,content_hash) values (${source!.id},1,'合成测试','测试元数据','测试定位','restricted_metadata_only','只保留元数据','conditional',${"e".repeat(64)}) returning id`;
    await expect(sql`insert into rag.source_chunks(source_version_id,ordinal,content_text,locator,content_hash) values (${version!.id},0,'不得进入切片',${sql.json({})},${"f".repeat(64)})`).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects duplicate command keys and terminal-state revival", async () => {
    await sql`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status) values (${workspaceA},${taskA},'same-command','save',${"1".repeat(64)},'succeeded')`;
    await expect(sql`insert into ops.command_receipts(workspace_id,task_id,idempotency_key,operation,request_hash,status) values (${workspaceA},${taskA},'same-command','save',${"2".repeat(64)},'succeeded')`).rejects.toMatchObject({ code: "23505" });
    const [job] = await sql<{ id: string }[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key) values (${workspaceA},${taskA},'audit','succeeded','terminal-job') returning id`;
    await expect(sql`update ops.jobs set status='running' where id=${job!.id}`).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps RLS disabled for the approved localhost-only model", async () => {
    const enabled = await sql<{ count: number }[]>`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('core','rag','ops') and c.relrowsecurity`;
    expect(enabled[0]?.count).toBe(0);
  });

  it("lets the app enqueue only through the guarded function", async () => {
    let directDenied = false;
    await sql.begin(async (tx) => {
      await tx`set local role tracepbl_app`;
      try { await tx`insert into ops.jobs(workspace_id,task_id,job_kind,idempotency_key) values (${workspaceA},${taskA},'audit','forbidden-direct-job')`; }
      catch (error) { directDenied = (error as { code?: string }).code === "42501"; throw error; }
    }).catch(() => undefined);
    await sql.begin(async (tx) => {
      await tx`set local role tracepbl_app`;
      const queued = await tx<{ id: string; status: string }[]>`select id,status from ops.enqueue_job(${workspaceA},${taskA},${null},'audit','guarded-job',${tx.json({})},0,3)`;
      expect(queued[0]).toMatchObject({ status: "queued" });
    });
    expect(directDenied).toBe(true);
    const events = await sql<{ event_type: string }[]>`select event_type from ops.job_events where workspace_id=${workspaceA} and task_id=${taskA}`;
    expect(events.map((event) => event.event_type)).toContain("operation.queued");
  });

  it("claims one job once and fences an expired worker lease", async () => {
    const [created] = await sql<{ id: string }[]>`insert into ops.jobs(workspace_id,task_id,job_kind,idempotency_key,priority) values (${workspaceA},${taskA},'embedding','lease-test',100) returning id`;
    const claim = (worker: string) => sql.begin(async (tx) => {
      const rows = await tx<{ id: string; lease_token: string }[]>`with candidate as (select id from ops.jobs where id=${created!.id} and status='queued' for update skip locked) update ops.jobs j set status='running',attempts=attempts+1,locked_at=now(),locked_by=${worker},lease_token=uuidv7(),lease_expires_at=now()+interval '30 seconds' from candidate where j.id=candidate.id returning j.id,j.lease_token`;
      await new Promise((resolve) => setTimeout(resolve, 30)); return rows[0] ?? null;
    });
    const claims = await Promise.all([claim("worker-a"), claim("worker-b")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const oldToken = claims.find(Boolean)!.lease_token;
    await sql`update ops.jobs set lease_expires_at=now()-interval '1 second' where id=${created!.id}`;
    const [reclaimed] = await sql<{ lease_token: string }[]>`update ops.jobs set attempts=attempts+1,locked_by='worker-c',lease_token=uuidv7(),lease_expires_at=now()+interval '30 seconds' where id=${created!.id} and status='running' and lease_expires_at<now() returning lease_token`;
    expect(reclaimed!.lease_token).not.toBe(oldToken);
    const staleWrite = await sql`update ops.jobs set progress_current=1 where id=${created!.id} and lease_token=${oldToken}`;
    expect(staleWrite.count).toBe(0);
  });

  it("binds budget reservations to the same workspace, task, and job", async () => {
    const [job] = await sql<{ id: string }[]>`insert into ops.jobs(workspace_id,task_id,job_kind,idempotency_key) values (${workspaceA},${taskA},'model','budget-job') returning id`;
    await sql`insert into ops.usage_ledger(workspace_id,task_id,job_id,usage_day,usage_kind,status,reserved_calls,reserved_tokens,reserved_cny_micros) values (${workspaceA},${taskA},${job!.id},current_date,'generation','reserved',1,28000,2000000)`;
    await expect(sql`insert into ops.usage_ledger(workspace_id,task_id,job_id,usage_day,usage_kind,status) values (${workspaceB},${taskB},${job!.id},current_date,'embedding','reserved')`).rejects.toMatchObject({ code: "23503" });
  });

  it("persists P01/P02/P05/P06/P07 through scoped repositories and optimistic locks", async () => {
    const tasks=new TaskRepository(sql); const content=new ContentRepository(sql); const scope={workspaceId:workspaceA,sessionId:"synthetic-session"};
    const task=await tasks.create(scope,"合成后端任务","repository-task-create");
    const afterContext=await tasks.putContext(scope,task.id,0,{stage:"高中",grade:"高一",textbook:"合成教材",lesson:"合成课次",lessonTypes:["新授"],minutes:45,inquiryDirection:"合成问题",priorKnowledge:null,learningNeeds:[],profileNote:null});
    expect(afterContext.lockVersion).toBe(1); const storedContext=await tasks.getContext(scope,task.id); expect(storedContext?.stage).toBe("senior");
    await content.putQuestionSet(scope,task.id,1,{centralQuestion:"合成中心问题？",subQuestions:["合成子问题？"],confirmed:true});
    await content.putEvidenceMap(scope,task.id,2,{claims:[]}); await content.putLessonDesign(scope,task.id,3,{activities:[]}); await content.putRubric(scope,task.id,4,{items:[]});
    expect((await tasks.get(scope,task.id)).lockVersion).toBe(5); expect(await content.questionSet(scope,task.id)).toMatchObject({centralQuestion:"合成中心问题？",confirmed:true});
    await expect(tasks.get({workspaceId:workspaceB,sessionId:"synthetic-session"},task.id)).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
    await expect(tasks.putContext(scope,task.id,0,{stage:"高中",grade:"高一",textbook:"合成教材",lesson:"过期写入",lessonTypes:["新授"],minutes:45,inquiryDirection:null,priorKnowledge:null,learningNeeds:[],profileNote:null})).rejects.toMatchObject({code:"VERSION_CONFLICT"});
    await sql`delete from core.tasks where id=${task.id}`;
  });

  it("preserves dependent work safely when upstream questions, lessons, or source selection change",async()=>{
    const tasks=new TaskRepository(sql);const content=new ContentRepository(sql);const sources=new SourceRepository(sql);const scope={workspaceId:workspaceA,sessionId:"synthetic-session"};
    const task=await tasks.create(scope,"合成生命周期任务","lifecycle-task-create");
    await tasks.putContext(scope,task.id,0,{stage:"高中",grade:"高一",textbook:"合成教材",lesson:"合成课次",lessonTypes:["新授"],minutes:45,inquiryDirection:"合成问题",priorKnowledge:null,learningNeeds:[],profileNote:null});
    await content.putQuestionSet(scope,task.id,1,{centralQuestion:"原问题？",subQuestions:["原子问题？"],confirmed:true});
    const material=await sources.createMaterial(scope,task.id,{kind:"text",name:"合成材料",text:"只用于生命周期测试的合成正文。",rightsAttestation:"authorizedForCurrentTask"},"lifecycle-material-create");
    const versionId=String(material.versionId);await sources.select(scope,task.id,2,[versionId]);
    await content.putEvidenceMap(scope,task.id,3,{claims:[{text:"合成主张",gapAccepted:false,relations:[{sourceVersionId:versionId,kind:"supports",reason:"合成理由",citations:[{sourceVersionId:versionId,chunkId:null,quotedText:null}]}]}]});
    const lesson={activities:[{title:"合成活动",activityMinutes:30,transitionMinutes:2,studentAction:"阅读合成材料",evidenceProduct:"合成产物",difficulty:"适中",scaffold:"提示",sourceVersionIds:[versionId]}]};
    await content.putLessonDesign(scope,task.id,4,lesson);await content.putRubric(scope,task.id,5,{items:[{title:"合成量规",activityOrdinals:[0],levels:[{key:"support",label:"支持",description:"需支持"},{key:"expected",label:"达标",description:"达到"},{key:"strong",label:"充分",description:"充分"}]}]});
    await content.putQuestionSet(scope,task.id,6,{centralQuestion:"新问题？",subQuestions:["新子问题？"],confirmed:true});
    await content.putLessonDesign(scope,task.id,7,lesson);
    await expect(sources.select(scope,task.id,8,[])).rejects.toThrow("INVALID_STATE");
    const revisions=await sql<{snapshot:Record<string,unknown>}[]>`select snapshot from core.task_revisions where task_id=${task.id} order by revision_no desc limit 1`;
    expect(revisions[0]?.snapshot).toMatchObject({title:"合成课次",questionSet:{centralQuestion:"新问题？"},sourceSelection:{sourceVersionIds:[versionId]},lessonDesign:lesson});
    const copied=await tasks.copy(scope,task.id,"合成独立副本","lifecycle-task-copy");const replay=await tasks.copy(scope,task.id,"合成独立副本","lifecycle-task-copy");expect(replay.id).toBe(copied.id);const copiedSources=await sources.list(scope,copied.id);expect(copiedSources.find(item=>item.selected)?.version_id).not.toBe(versionId);expect(await content.evidenceMap(scope,copied.id)).toMatchObject({claims:[{text:"合成主张"}]});
    const copyLease=crypto.randomUUID();await sql`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${copied.id}`;const copyPurge=await sql<{id:string}[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at,locked_by) values (${workspaceA},${copied.id},'purge','running','copy-purge',${copyLease},now()+interval '30 seconds','synthetic-worker') returning id`;expect((await sql<{purged:boolean}[]>`select ops.purge_task(${copyPurge[0]!.id},${copyLease}) as purged`)[0]?.purged).toBe(true);
    const lease=crypto.randomUUID();await sql`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${task.id}`;
    const purge=await sql<{id:string}[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at,locked_by) values (${workspaceA},${task.id},'purge','running','lifecycle-purge',${lease},now()+interval '30 seconds','synthetic-worker') returning id`;
    expect((await sql<{purged:boolean}[]>`select ops.purge_task(${purge[0]!.id},${lease}) as purged`)[0]?.purged).toBe(true);
    expect(await sql`select 1 from core.tasks where id=${task.id}`).toHaveLength(0);
  });

  it("gates approval and creates an immutable browser-export manifest",async()=>{
    const scope={workspaceId:workspaceA,sessionId:"synthetic-session"};const tasks=new TaskRepository(sql);const sources=new SourceRepository(sql);const workflow=new WorkflowRepository(sql);const task=await tasks.create(scope,"合成签发任务","approval-task-create");
    await tasks.putContext(scope,task.id,0,{stage:"高中",grade:"高一",textbook:"合成教材",lesson:"合成签发课",lessonTypes:[],minutes:45,inquiryDirection:null,priorKnowledge:null,learningNeeds:[],profileNote:null});
    await new ContentRepository(sql).putQuestionSet(scope,task.id,1,{centralQuestion:"合成问题？",subQuestions:[],confirmed:true});
    const source=await sql<{id:string}[]>`select sv.id from core.source_versions sv join core.sources s on s.id=sv.source_id where s.scope='catalog' and sv.rights_state='verified_reusable' and sv.verification_state='verified' order by sv.created_at limit 1`;await sources.select(scope,task.id,2,[source[0]!.id]);
    const revision=await sql<{id:string}[]>`select id from core.task_revisions where task_id=${task.id} and reason='teacher_confirmed' order by revision_no desc limit 1`;await sql`insert into core.verification_runs(workspace_id,task_id,run_kind,input_lock_version,status,started_at,completed_at,summary) values (${workspaceA},${task.id},'design_audit',3,'succeeded',now(),now(),${sql.json({pass:true})})`;
    const approved=await workflow.decide(scope,task.id,{kind:"approve",taskRevisionId:revision[0]!.id},3,"approval-decision-create");expect(approved).toMatchObject({kind:"approve",lockVersion:4});
    const queued=await workflow.enqueueExport(scope,task.id,{format:"pdf",fileName:"合成教案.pdf"},4,"approval-export-create");const lease=crypto.randomUUID();await sql`update ops.jobs set status='running',attempts=1,lease_token=${lease},lease_expires_at=now()+interval '30 seconds',locked_by='synthetic-worker' where id=${queued.jobId}`;const completed=await sql<{id:string|null}[]>`select ops.complete_export(${queued.jobId},${lease},${queued.exportId},4) as id`;expect(completed[0]?.id).toBeTruthy();const manifest=await workflow.exportManifest(scope,task.id,queued.exportId);expect(manifest).toMatchObject({format:"pdf",fileName:"合成教案.pdf",revisionId:completed[0]!.id});expect(JSON.stringify(manifest)).not.toMatch(/workspace|server|path/i);
    const purgeLease=crypto.randomUUID();await sql`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${task.id}`;const purge=await sql<{id:string}[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at,locked_by) values (${workspaceA},${task.id},'purge','running','approval-purge',${purgeLease},now()+interval '30 seconds','synthetic-worker') returning id`;expect((await sql<{purged:boolean}[]>`select ops.purge_task(${purge[0]!.id},${purgeLease}) as purged`)[0]?.purged).toBe(true);
  });

  it("adopts a validated proposal once and resumes the paused graph without replaying generation",async()=>{
    const scope={workspaceId:workspaceA,sessionId:"synthetic-session"};const tasks=new TaskRepository(sql);const workflow=new WorkflowRepository(sql);const content=new ContentRepository(sql);const task=await tasks.create(scope,"合成采用任务","adoption-task-create");const inputRevision=await sql<{id:string}[]>`select id from core.task_revisions where task_id=${task.id} order by revision_no desc limit 1`;await sql`update core.tasks set revision_seq=2 where id=${task.id}`;const proposal={centralQuestion:"模型合成问题？",subQuestions:["模型合成子问题？"],confirmed:false};const generated=await sql<{id:string}[]>`insert into core.task_revisions(workspace_id,task_id,revision_no,reason,schema_version,base_lock_version,snapshot,content_hash,created_by) values (${workspaceA},${task.id},2,'generated',1,0,${sql.json({purpose:"questionGuidance",proposal,citations:[]})},${"9".repeat(64)},'worker') returning id`;const run=await sql<{id:string}[]>`insert into rag.model_runs(workspace_id,task_id,task_revision_id,purpose,provider,model,prompt_template_version,input_fingerprint,status,output_task_revision_id) values (${workspaceA},${task.id},${inputRevision[0]!.id},'question_guidance','zhipu','GLM-5.3-Flash','question-guidance.v1',${"8".repeat(64)},'succeeded',${generated[0]!.id}) returning id`;const job=await sql<{id:string}[]>`insert into ops.jobs(workspace_id,task_id,model_run_id,job_kind,status,wait_state,idempotency_key,payload) values (${workspaceA},${task.id},${run[0]!.id},'model','running','teacher','adoption-paused-job',${sql.json({baseLockVersion:0})}) returning id`;const adopted=await workflow.adopt(scope,task.id,generated[0]!.id,"questionSet",proposal,0,"adoption-command-create");expect(adopted).toEqual({lockVersion:1,section:"questionSet"});expect(await content.questionSet(scope,task.id)).toMatchObject(proposal);const resumed=await sql<{status:string;wait_state:string|null;decision_id:string}[]>`select status,wait_state,payload->>'decisionId' as decision_id from ops.jobs where id=${job[0]!.id}`;expect(resumed[0]).toMatchObject({status:"queued",wait_state:null});expect(resumed[0]?.decision_id).toBeTruthy();
    const purgeLease=crypto.randomUUID();await sql`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${task.id}`;await sql`update ops.jobs set status='cancelled',wait_state=null where id=${job[0]!.id}`;const purge=await sql<{id:string}[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at,locked_by) values (${workspaceA},${task.id},'purge','running','adoption-purge',${purgeLease},now()+interval '30 seconds','synthetic-worker') returning id`;expect((await sql<{purged:boolean}[]>`select ops.purge_task(${purge[0]!.id},${purgeLease}) as purged`)[0]?.purged).toBe(true);
  });

  it("hard-purges the task subtree while retaining catalog sources", async () => {
    const catalogBefore = await sql<{ count: number }[]>`select count(*)::int as count from core.sources where scope='catalog'`;
    await sql`delete from core.tasks where workspace_id=${workspaceA} and id=${taskA}`;
    const remaining = await sql<{ tasks: number; private_sources: number; commands: number }[]>`
      select (select count(*)::int from core.tasks where id=${taskA}) as tasks,
             (select count(*)::int from core.sources where task_id=${taskA}) as private_sources,
             (select count(*)::int from ops.command_receipts where task_id=${taskA}) as commands`;
    const catalogAfter = await sql<{ count: number }[]>`select count(*)::int as count from core.sources where scope='catalog'`;
    expect(remaining[0]).toEqual({ tasks: 0, private_sources: 0, commands: 0 });
    expect(catalogAfter[0]?.count).toBe(catalogBefore[0]?.count);
  });
});
