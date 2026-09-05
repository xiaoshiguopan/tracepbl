import { createHmac } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../apps/api/src/app.ts";
import { createCheckpointer, initializeCheckpointer } from "../apps/worker/src/checkpointer.ts";
import { createHandlers } from "../apps/worker/src/handlers.ts";
import { WorkerRunner } from "../apps/worker/src/runner.ts";
import { FakeAiProvider } from "@tracepbl/ai";
import { connectDatabase, JobRepository, type Database } from "@tracepbl/repositories";
import { ExportManifestSchema, TaskDetailSchema } from "@tracepbl/contracts";
import { applyMigrations } from "../database/scripts/database.ts";

let owner: ReturnType<typeof postgres>;
let appDb: Database; let workerDb: Database;
let checkpoint: ReturnType<typeof createCheckpointer>;
let app: ReturnType<typeof createApp>; let runner: WorkerRunner;
let cookie = "";
const origin = "http://127.0.0.1:8787";
const context = { stage: "初中", grade: "七年级", textbook: "合成教材", lesson: "合成研究课", lessonTypes: [], minutes: 45, inquiryDirection: null, priorKnowledge: null, learningNeeds: [], profileNote: null };
const taskIds: string[] = [];

beforeAll(async () => {
  const url = process.env.TRACEPBL_TEST_DATABASE_URL;
  if (!url) throw new Error("Stage 11 tests require an isolated synthetic TRACEPBL_TEST_DATABASE_URL");
  owner = postgres(url, { max: 4, onnotice: () => undefined }); await applyMigrations(owner); await initializeCheckpointer(url);
  const appUrl = new URL(url); appUrl.username = "tracepbl_app"; appUrl.password = "synthetic-stage11-app-password-000000";
  const workerUrl = new URL(url); workerUrl.username = "tracepbl_worker"; workerUrl.password = "synthetic-stage11-worker-password-000";
  const commands = await owner<{command: string}[]>`select format('alter role tracepbl_app login password %L',${appUrl.password}::text) as command union all select format('alter role tracepbl_worker login password %L',${workerUrl.password}::text)`;
  for (const command of commands) await owner.unsafe(command.command);
  appDb = connectDatabase(appUrl.toString(), 4); workerDb = connectDatabase(workerUrl.toString(), 4); checkpoint = createCheckpointer(workerUrl.toString());
  app = createApp(appDb, { host: "127.0.0.1", port: 8787, allowedOrigin: origin, databaseUrl: "synthetic", sessionSecret: "q".repeat(43), mode: "ci", aiConfigured: true, priceProfileVersion: "synthetic-zero-cost", generationReservationCnyMicros: 0, urlFetchEnabled: false });
  const jobs = new JobRepository(workerDb);
  runner = new WorkerRunner(jobs, "stage11-test", createHandlers({ sql: workerDb, jobs, provider: new FakeAiProvider({ proposal: { centralQuestion: "合成待审问题？", focus: "single", subQuestions: [], confirmed: false }, citations: [] }), checkpointer: checkpoint, urlFetchEnabled: false, actualCostMicros: () => 0 }));
  const response = await app.request(`${origin}/api/v1/runtime`); cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
}, 60_000);

afterAll(async () => {
  if (owner && checkpoint) for (const task of taskIds) {
    const threads = await owner<{ external_thread_id: string }[]>`select external_thread_id from rag.model_runs where task_id=${task} and external_thread_id is not null`;
    for (const thread of threads) await checkpoint.deleteThread(thread.external_thread_id);
    await owner`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${task}`;
    await owner`update ops.jobs set status='cancelled',lease_token=null,lease_expires_at=null,wait_state=null where task_id=${task} and status in ('queued','running')`;
    const lease = crypto.randomUUID();
    const purge = await owner<{ id: string }[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at,locked_by) select workspace_id,id,'purge','running',${crypto.randomUUID()},${lease},now()+interval '30 seconds','stage11-cleanup' from core.tasks where id=${task} returning id`;
    if (purge[0]) expect((await workerDb<{ purged: boolean }[]>`select ops.purge_task(${purge[0].id},${lease}) as purged`)[0]?.purged).toBe(true);
  }
  if (checkpoint) await checkpoint.end();
  if (appDb) await appDb.end(); if (workerDb) await workerDb.end(); if (owner) await owner.end();
});

async function request(path: string, method = "GET", body?: unknown, version?: number, key = crypto.randomUUID()) {
  return app.request(`${origin}/api/v1${path}`, { method, headers: { Cookie: cookie, Origin: origin, "Sec-Fetch-Site": "same-origin", ...(method === "GET" ? {} : { "Content-Type": "application/json", "Idempotency-Key": key }), ...(version === undefined ? {} : { "If-Match": `"task-lv-${version}"` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function create() {
  const response = await request("/tasks", "POST", { title: "合成阶段11任务" }); expect(response.status).toBe(201);
  const task = await response.json() as { id: string }; taskIds.push(task.id); return task.id;
}
async function runOperation(task: string, id: string) {
  for (let count = 0; count < 30; count++) {
    await runner.runOnce();
    const response = await request(`/tasks/${task}/operations/${id}`);
    const operation = await response.json() as { status: string; phase?: string; result?: { href: string }; error?: unknown };
    if (!["queued", "running"].includes(operation.status) || operation.phase === "waitingForTeacher") return operation;
  }
  throw new Error("Operation did not reach a reviewable/terminal state");
}

describe("stage 11 API/database/Worker integration", () => {
  it("runs a complete saved workflow, freezes export contents and preserves the old manifest after editing", async () => {
    const task = await create();
    const save = async (section: string, body: unknown, version: number) => { const response = await request(`/tasks/${task}/${section}`, "PUT", body, version); expect(await response.clone().json()).not.toHaveProperty("code"); expect(response.status).toBe(200); };
    await save("context", context, 0);
    const questions = { centralQuestion: "合成记录能说明哪些变化？", subQuestions: ["记录有什么？", "有哪些限制？"], focus: "whole-lesson", confirmed: true };
    await save("question-set", questions, 1);
    const source = await owner<{id:string}[]>`insert into core.sources(scope,workspace_id,task_id,material_kind,title,data_class) select 'task_private',workspace_id,id,'text','合成冻结来源','synthetic' from core.tasks where id=${task} returning id`;
    const version = await owner<{id:string}[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash) values (${source[0]!.id},1,'合成作者','文字记录','合成第一段','合成记录甲。','verified_reusable','synthetic','verified',${"c".repeat(64)}) returning id`;
    const sourceId = version[0]!.id;
    await save("source-selection", {sourceVersionIds:[sourceId]}, 2);
    await save("evidence-map", {claims:questions.subQuestions.map(text => ({text,gapAccepted:false,relations:[{sourceVersionId:sourceId,kind:"supports",reason:"合成记录用于比较练习。",citations:[{sourceVersionId:sourceId,chunkId:null,quotedText:null}]}]}))}, 3);
    await save("lesson-design", {activities:[{title:"合成阅读活动",activityMinutes:45,transitionMinutes:0,studentAction:"比较材料并标注出处。",evidenceProduct:"带来源的解释短文",difficulty:"区分记录与推断",scaffold:"指出依据",sourceVersionIds:[sourceId]}]}, 4);
    await save("rubric", {items:[{title:"准确引用",activityOrdinals:[0],levels:[{key:"support",label:"需要支持",description:"提示下标明出处。"},{key:"expected",label:"达到要求",description:"准确引用并解释。"},{key:"strong",label:"表现充分",description:"比较证据并说明限制。"}]}]}, 5);
    const audit = await (await request(`/tasks/${task}/audits`,"POST",{baseLockVersion:6},6)).json() as {runId:string;operation:{id:string}};
    expect(await runOperation(task,audit.operation.id)).toMatchObject({status:"succeeded"});
    expect(await (await request(`/tasks/${task}/audits/${audit.runId}`)).json()).toMatchObject({summary:{pass:true}});
    const detail = TaskDetailSchema.parse(await (await request(`/tasks/${task}`)).json());
    expect((await request(`/tasks/${task}/decisions`,"POST",{kind:"approve",taskRevisionId:detail.latestTeacherRevisionId},6)).status).toBe(201);
    const key=crypto.randomUUID();
    const enqueue=()=>request(`/tasks/${task}/exports`,"POST",{format:"docx",fileName:"合成冻结教学包"},7,key);
    const exported = await (await enqueue()).json() as {exportId:string;operation:{id:string}};
    expect(await (await enqueue()).json()).toMatchObject({exportId:exported.exportId});
    expect(await runOperation(task,exported.operation.id)).toMatchObject({status:"succeeded"});
    const manifest = ExportManifestSchema.parse(await (await request(`/tasks/${task}/exports/${exported.exportId}/manifest`)).json());
    expect(manifest.content.questionSet.subQuestions).toEqual(questions.subQuestions);
    expect(manifest.content.sources[0]).toMatchObject({title:"合成冻结来源",versionId:sourceId,contentText:"合成记录甲。"});
    await save("context",{...context,lesson:"合成修改后课程"},7);
    expect(await (await request(`/tasks/${task}/exports/${exported.exportId}/manifest`)).json()).toEqual(manifest);
    const staleAudit=await (await request(`/tasks/${task}/audits`,"POST",{baseLockVersion:8},8)).json() as {runId:string;operation:{id:string}};
    await runOperation(task,staleAudit.operation.id);
    expect(await (await request(`/tasks/${task}/audits/${staleAudit.runId}`)).json()).toMatchObject({findings:expect.arrayContaining([expect.objectContaining({title:"上游变化尚未复核",severity:"blocking"})])});
    expect((await request(`/tasks/${task}/exports`,"POST",{format:"pdf",fileName:"不能导出"},8)).status).toBe(409);
  });

  it("cancels queued work, rejects stale adoption, and restores only inside the deletion window", async () => {
    const task=await create(); await request(`/tasks/${task}/context`,"PUT",context,0);
    const enqueue=()=>request(`/tasks/${task}/proposals`,"POST",{purpose:"questionGuidance",baseLockVersion:1,disclosureVersion:"ai-disclosure.v1"},1);
    const first=await (await enqueue()).json() as {operation:{id:string}};
    const cancelKey=crypto.randomUUID();
    for(let i=0;i<2;i++) expect(await (await request(`/tasks/${task}/operations/${first.operation.id}`,"DELETE",{},undefined,cancelKey)).json()).toMatchObject({status:"cancelled"});
    const second=await (await enqueue()).json() as {operation:{id:string}};
    const ready=await runOperation(task,second.operation.id);
    expect(ready.phase).toBe("waitingForTeacher");
    const proposal=await (await app.request(`${origin}${ready.result!.href}`,{headers:{Cookie:cookie}})).json() as {revisionId:string};
    await request(`/tasks/${task}/context`,"PUT",{...context,lesson:"修改使结果过期"},1);
    expect((await request(`/tasks/${task}/proposals/${proposal.revisionId}/adoption`,"POST",{generatedRevisionId:proposal.revisionId,sections:["questionSet"],baseLockVersion:1},1)).status).toBe(412);
    expect((await request(`/tasks/${task}`,"DELETE",{impactConfirmed:true},2)).status).toBe(202);
    expect((await request(`/tasks/${task}/restorations`,"POST",{},3)).status).toBe(200);
    const current=TaskDetailSchema.parse(await (await request(`/tasks/${task}`)).json());
    await request(`/tasks/${task}`,"DELETE",{impactConfirmed:true},current.lockVersion);
    await owner`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${task}`;
    expect((await request(`/tasks/${task}/restorations`,"POST",{},current.lockVersion+1)).status).toBe(409);
  });
  it("coalesces concurrent creates and rejects reuse of a material key in another task", async () => {
    const key = crypto.randomUUID();
    const responses = await Promise.all(Array.from({ length: 3 }, () => request("/tasks", "POST", { title: "合成重复创建" }, undefined, key)));
    const bodies = await Promise.all(responses.map(response => response.json())) as Array<{ id: string }>;
    for (const body of bodies) if (body.id && !taskIds.includes(body.id)) taskIds.push(body.id);
    expect(responses.map(response => response.status)).toEqual([201, 201, 201]);
    expect(new Set(bodies.map(body => body.id)).size).toBe(1);
    const other = await create(); const materialKey = crypto.randomUUID();
    const input = { kind: "text", name: "合成文本", text: "合成非史料测试文本", rightsAttestation: "unknown", sensitiveInformationConfirmedAbsent: true };
    expect((await request(`/tasks/${bodies[0]!.id}/materials`, "POST", input, undefined, materialKey)).status).toBe(202);
    expect((await request(`/tasks/${other}/materials`, "POST", input, undefined, materialKey)).status).toBe(409);
  });
  it("round-trips four subquestions, empty lesson types and authoritative revision identifiers", async () => {
    const task = await create();
    expect((await request(`/tasks/${task}/context`, "PUT", context, 0)).status).toBe(200);
    const question = { centralQuestion: "合成开放问题？", focus: "whole-lesson", subQuestions: ["甲？", "乙？", "丙？", "丁？"], confirmed: true };
    expect((await request(`/tasks/${task}/question-set`, "PUT", question, 1)).status).toBe(200);
    const detail = TaskDetailSchema.parse(await (await request(`/tasks/${task}`)).json());
    expect(detail.latestTeacherRevisionId).toBeTruthy(); expect(detail.lockVersion).toBe(2);
    expect(await (await request(`/tasks/${task}/question-set`)).json()).toMatchObject({ subQuestions: question.subQuestions });
    expect((await request(`/tasks/${task}/context`, "PUT", context, 0)).status).toBe(412);
  });

  it("generates a question before sources exist and requires a separate teacher adoption", async () => {
    const task = await create(); await request(`/tasks/${task}/context`, "PUT", context, 0);
    const response = await request(`/tasks/${task}/proposals`, "POST", { purpose: "questionGuidance", baseLockVersion: 1, disclosureVersion: "ai-disclosure.v1" }, 1);
    expect(response.status).toBe(202); const queued = await response.json() as { operation: { id: string } };
    const operation = await runOperation(task, queued.operation.id);
    expect(operation).toMatchObject({ status: "running", phase: "waitingForTeacher" });
    expect(await (await request(`/tasks/${task}/question-set`)).json()).toBeNull();
    const proposal = await (await app.request(`${origin}${operation.result!.href}`, { headers: { Cookie: cookie } })).json() as { revisionId: string };
    const adopted = await request(`/tasks/${task}/proposals/${proposal.revisionId}/adoption`, "POST", { generatedRevisionId: proposal.revisionId, sections: ["questionSet"], baseLockVersion: 1 }, 1);
    expect(adopted.status).toBe(200);
    expect(await (await request(`/tasks/${task}/question-set`)).json()).toMatchObject({ centralQuestion: "合成待审问题？", subQuestions: [] });
  });

  it("atomically adopts edited content, preserves generated history, and binds retries to that content", async () => {
    const task = await create(); await request(`/tasks/${task}/context`, "PUT", context, 0);
    const response = await request(`/tasks/${task}/proposals`, "POST", {purpose:"questionGuidance",baseLockVersion:1,disclosureVersion:"ai-disclosure.v1"},1);
    expect(response.status).toBe(202); const queued = await response.json() as {operation:{id:string}};
    const operation = await runOperation(task,queued.operation.id);
    const again = await request(`/tasks/${task}/proposals`, "POST", {purpose:"questionGuidance",baseLockVersion:1,disclosureVersion:"ai-disclosure.v1"},1);
    expect(again.status).toBe(202);
    const againQueued = await again.json() as {operation:{id:string}};
    const repeated = await runOperation(task,againQueued.operation.id);
    expect(repeated.phase, JSON.stringify(repeated.error)).toBe("waitingForTeacher");
    expect(repeated.result?.href).not.toBe(operation.result?.href);
    const generated = await (await app.request(`${origin}${operation.result!.href}`,{headers:{Cookie:cookie}})).json() as {revisionId:string;snapshot:unknown};
    const path = `/tasks/${task}/proposals/${generated.revisionId}/adoption`;
    const reviewedContent = {centralQuestion:"教师编辑的合成问题？",focus:"single",subQuestions:[],confirmed:true};
    const body = {generatedRevisionId:generated.revisionId,sections:["questionSet"],baseLockVersion:1,reviewedContent};
    expect((await request(path,"POST",{...body,reviewedContent:{...reviewedContent,unknownField:"reject"}},1)).status).toBe(422);
    expect((await request(path,"POST",{...body,sections:["evidenceMap"]},1)).status).toBe(409);
    const other = await create();
    expect((await request(`/tasks/${other}/proposals/${generated.revisionId}/adoption`,"POST",{...body,baseLockVersion:0},0)).status).toBe(404);
    const key=crypto.randomUUID();
    expect((await request(path,"POST",body,1,key)).status).toBe(200);
    expect((await request(path,"POST",body,1,key)).status).toBe(200);
    expect((await request(path,"POST",{...body,reviewedContent:{...reviewedContent,centralQuestion:"不同正文"}},1,key)).status).toBe(409);
    expect(await (await request(`/tasks/${task}/question-set`)).json()).toMatchObject({centralQuestion:reviewedContent.centralQuestion,subQuestions:[],confirmed:true});
    const original = await owner<{snapshot:unknown}[]>`select snapshot from core.task_revisions where id=${generated.revisionId}`;
    expect(original[0]!.snapshot).toEqual(generated.snapshot);
    const revisions = await owner<{count:number}[]>`select count(*)::int as count from core.task_revisions where task_id=${task} and reason='teacher_confirmed' and base_lock_version=1`;
    expect(revisions[0]!.count).toBe(1);
  });

  it("does not allow accepting a blocking audit finding to bypass final approval", async () => {
    const task = await create();
    const response = await request(`/tasks/${task}/audits`, "POST", { baseLockVersion: 0 }, 0);
    const queued = await response.json() as { runId: string; operation: { id: string } }; await runOperation(task, queued.operation.id);
    const audit = await (await request(`/tasks/${task}/audits/${queued.runId}`)).json() as { findings: Array<{ id: string; severity: string }> };
    const finding = audit.findings.find(item => item.severity === "blocking")!;
    expect((await request(`/tasks/${task}/decisions`, "POST", { kind: "acceptRisk", findingId: finding.id, reason: "合成绕过尝试" }, 0)).status).toBe(409);
  });

  it("returns the same safe result for deleted and missing operations", async () => {
    const task = await create();
    const response = await request(`/tasks/${task}/audits`, "POST", { baseLockVersion: 0 }, 0);
    const queued = await response.json() as { operation: { id: string } };
    expect((await request(`/tasks/${task}`, "DELETE", { impactConfirmed: true }, 0)).status).toBe(202);
    const deleted = await request(`/tasks/${task}/operations/${queued.operation.id}`);
    const missing = await request(`/tasks/${task}/operations/${crypto.randomUUID()}`);
    expect(deleted.status).toBe(404); expect(missing.status).toBe(404);
    expect(await deleted.json()).toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

 it("requires an optimistic lock and hides another workspace task", async () => {
   const task = await create();
   expect((await request(`/tasks/${task}/context`, "PUT", context)).status).toBe(428);
   const ownCookie = cookie;
   // Local runtime intentionally issues sessions for the same local workspace.
   // Sign a synthetic foreign scope with the test-only secret to test authorization separately.
   const payload = Buffer.from(JSON.stringify({workspaceId: crypto.randomUUID(), sessionId: crypto.randomUUID(), expiresAt: Date.now()+60_000})).toString("base64url");
   cookie = `tracepbl_local_session=${payload}.${createHmac("sha256", "q".repeat(43)).update(payload).digest("base64url")}`;
   try {
     for (const suffix of ["", "/context", "/sources", "/operations"]) {
       const denied = await request(`/tasks/${task}${suffix}`);
       const absent = await request(`/tasks/${crypto.randomUUID()}${suffix}`);
       expect(denied.status).toBe(404); expect(absent.status).toBe(404);
       expect((await denied.json() as {code:string}).code).toBe((await absent.json() as {code:string}).code);
     }
   } finally { cookie = ownCookie; }
 });

it("rejects adoption after cancelling a proposal waiting for teacher review", async () => {
  const task = await create(); await request(`/tasks/${task}/context`, "PUT", context, 0);
  const response = await request(`/tasks/${task}/proposals`, "POST", {purpose:"questionGuidance",baseLockVersion:1,disclosureVersion:"ai-disclosure.v1"},1);
  expect(response.status).toBe(202);
  const queued = await response.json() as {operation:{id:string}};
  const operation = await runOperation(task, queued.operation.id);
  expect(operation.phase).toBe("waitingForTeacher");
  const proposal = await (await app.request(`${origin}${operation.result!.href}`,{headers:{Cookie:cookie}})).json() as {revisionId:string};
  expect((await request(`/tasks/${task}/operations/${queued.operation.id}`,"DELETE",{})).status).toBe(200);
  expect((await request(`/tasks/${task}/proposals/${proposal.revisionId}/adoption`,"POST",{generatedRevisionId:proposal.revisionId,sections:["questionSet"],baseLockVersion:1},1)).status).toBe(409);
  expect(await (await request(`/tasks/${task}/question-set`)).json()).toBeNull();
});

it("blocks excess lesson minutes and requires explicit acceptance of conditional sources", async () => {
  const task=await create(); await request(`/tasks/${task}/context`,"PUT",context,0);
  const source=await owner<{id:string}[]>`insert into core.sources(scope,workspace_id,task_id,material_kind,title,data_class) select 'task_private',workspace_id,id,'text','合成有条件来源','synthetic' from core.tasks where id=${task} returning id`;
  const version=await owner<{id:string}[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash) values (${source[0]!.id},1,'合成作者','合成记录','合成定位','合成文本','verified_reusable','synthetic','conditional',${"a".repeat(64)}) returning id`;
  expect((await request(`/tasks/${task}/source-selection`,"PUT",{sourceVersionIds:[version[0]!.id]},1)).status).toBe(200);
  expect((await request(`/tasks/${task}/lesson-design`,"PUT",{activities:[{title:"合成超时活动",activityMinutes:45,transitionMinutes:1,studentAction:"比较",evidenceProduct:"表格",difficulty:"合成难度",scaffold:"提示",sourceVersionIds:[version[0]!.id]}]},2)).status).toBe(200);
  const queued=await (await request(`/tasks/${task}/audits`,"POST",{baseLockVersion:3},3)).json() as {runId:string;operation:{id:string}};
  await runOperation(task,queued.operation.id);
  const audit=await (await request(`/tasks/${task}/audits/${queued.runId}`)).json();
  expect(audit).toMatchObject({findings:expect.arrayContaining([expect.objectContaining({title:"课时合计与教学情境不一致",severity:"blocking"}),expect.objectContaining({title:"有条件可用来源需要确认",severity:"teacher_confirmation"})])});
});

it("retains an explicitly selected old source version and hides task-private alternatives", async () => {
  const task=await create(); const other=await create();
  const source=await owner<{id:string}[]>`insert into core.sources(scope,workspace_id,task_id,material_kind,title,data_class) select 'task_private',workspace_id,id,'text','合成版本来源','synthetic' from core.tasks where id=${task} returning id`;
  const versions:string[]=[];
  for(const number of [1,2]) {
    const rows=await owner<{id:string}[]>`insert into core.source_versions(source_id,version_no,creator_or_institution,source_type,locator,content_text,rights_state,rights_basis,verification_state,content_hash) values (${source[0]!.id},${number},'合成作者','合成记录',${`合成版本 ${number}`},${`合成正文 ${number}`},'verified_reusable','synthetic','verified',${String(number).repeat(64)}) returning id`;
    versions.push(rows[0]!.id);
  }
  expect((await request(`/tasks/${task}/source-selection`,"PUT",{sourceVersionIds:[versions[0]]},0)).status).toBe(200);
  const own=await (await request(`/tasks/${task}/sources`)).json() as {items:{versionId:string;selected:boolean;contentText:string}[]};
  expect(own.items).toEqual(expect.arrayContaining([expect.objectContaining({versionId:versions[0],selected:true,contentText:"合成正文 1"}),expect.objectContaining({versionId:versions[1],selected:false,contentText:"合成正文 2"})]));
  const foreign=await (await request(`/tasks/${other}/sources`)).json();
  for(const version of versions) expect(JSON.stringify(foreign)).not.toContain(version);
  expect((await request(`/tasks/${other}/source-selection`,"PUT",{sourceVersionIds:[versions[0]]},0)).status).toBe(404);
});

it("restores teacher reasons, appends edits, and rejects foreign, deleted or stale decisions", async () => {
  const task=await create(); await request(`/tasks/${task}/context`,"PUT",context,0);
  const queued=await (await request(`/tasks/${task}/audits`,"POST",{baseLockVersion:1},1)).json() as {runId:string;operation:{id:string}};
  await runOperation(task,queued.operation.id);
  const read=async()=>await (await request(`/tasks/${task}/audits/${queued.runId}`)).json() as {findings:{id:string;severity:string;teacherReason:string|null}[]};
  const finding=(await read()).findings.find(item=>item.severity==="teacher_confirmation")!;
  expect(finding.teacherReason).toBeNull();
  const decide=(reason:string,key=crypto.randomUUID(),version=1)=>request(`/tasks/${task}/decisions`,"POST",{kind:"acceptRisk",findingId:finding.id,reason},version,key);
  expect((await decide("合成理由：保留独立阅读时间。")).status).toBe(201);
  expect((await read()).findings.find(item=>item.id===finding.id)?.teacherReason).toBe("合成理由：保留独立阅读时间。");
  const key=crypto.randomUUID();
  for(let index=0;index<2;index++) expect((await decide("合成修订理由：课后完成阅读并核对出处。",key)).status).toBe(201);
  expect((await read()).findings.find(item=>item.id===finding.id)?.teacherReason).toBe("合成修订理由：课后完成阅读并核对出处。");
  const history=await owner<{reason:string}[]>`select reason from core.teacher_decisions where task_id=${task} and finding_id=${finding.id} order by decided_at,id`;
  expect(history.map(item=>item.reason)).toEqual(["合成理由：保留独立阅读时间。","合成修订理由：课后完成阅读并核对出处。"]);
  const other=await create();
  expect((await request(`/tasks/${other}/audits/${queued.runId}`)).status).toBe(404);
  expect((await request(`/tasks/${other}/decisions`,"POST",{kind:"acceptRisk",findingId:finding.id,reason:"合成越权修改"},0)).status).toBe(404);
  await request(`/tasks/${task}/context`,"PUT",{...context,minutes:40},1);
  expect((await decide("合成过期修改",crypto.randomUUID(),2)).status).toBe(404);
  expect((await request(`/tasks/${task}`,"DELETE",{impactConfirmed:true},2)).status).toBe(202);
  expect((await request(`/tasks/${task}/audits/${queued.runId}`)).status).toBe(404);
});
