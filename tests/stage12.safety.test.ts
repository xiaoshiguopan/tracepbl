import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectDatabase, DeletionJournal, TaskRepository, recoveryTaskDigest, type Database } from "@tracepbl/repositories";
import { applyMigrations } from "../database/scripts/database.ts";
import { fakePriceProfile } from "@tracepbl/domain";
import { createApp } from "../apps/api/src/app.ts";

let admin: Database, sql: Database;
let journal: DeletionJournal;
let databaseName: string;
let baseUrl: string;
const workspace = randomUUID();
const scope = { workspaceId: workspace, sessionId: randomUUID() };
const fingerprint = async () => createHash("sha256").update(await readFile(journal.path)).digest("hex");
beforeAll(async () => {
  baseUrl = process.env.TRACEPBL_TEST_DATABASE_URL ?? "";
  if (!baseUrl) throw new Error("An isolated TRACEPBL_TEST_DATABASE_URL is required; never point this at a preview database");
  admin = connectDatabase(baseUrl);
  databaseName = `stage12_${randomUUID().replaceAll("-", "")}`;
  await admin.unsafe(`create database ${databaseName}`);
  const url = new URL(baseUrl); url.pathname = `/${databaseName}`;
  sql = connectDatabase(url.href);
  await applyMigrations(sql);
  journal = new DeletionJournal(join(await mkdtemp(join(tmpdir(), "tracepbl-stage12-")), "deletion-journal.json"));
  await journal.initialize(sql);
  await sql`insert into core.workspaces(id,display_name) values (${workspace},'Stage12 synthetic safety')`;
}, 60_000);
afterAll(async () => { if (sql) await sql.end(); if (admin) await admin.end(); });

describe.sequential("CP-12-01 recovery and budget gates", () => {
  it("hides foreign and nonexistent resources consistently across all task read endpoints", async () => {
    const app = createApp(sql, {host:"127.0.0.1",port:8787,allowedOrigin:"http://127.0.0.1:8787",databaseUrl:"synthetic",sessionSecret:"q".repeat(43),mode:"ci",aiConfigured:false,urlFetchEnabled:false,priceProfileVersion:null,generationReservationCnyMicros:0}, journal);
    const cookie = (await app.request("http://127.0.0.1:8787/api/v1/runtime")).headers.get("set-cookie")!.split(";",1)[0]!;
    const foreign = await new TaskRepository(sql).create(scope,"synthetic foreign task",randomUUID());
    const resource = randomUUID();
    const paths = ["", "/context", "/question-set", "/sources", "/evidence-map", "/lesson-design", "/rubric", "/operations", `/operations/${resource}`, `/audits/${resource}`, `/exports/${resource}/manifest`, `/proposals/${resource}`, "/events"];
    for (const path of paths) {
      const responses = await Promise.all([foreign.id,randomUUID()].map(id => app.request(`http://127.0.0.1:8787/api/v1/tasks/${id}${path}`,{headers:{Cookie:cookie}})));
      const bodies = await Promise.all(responses.map(async response => await response.json() as { code: string; detail: string }));
      for (const response of responses) { expect(response.status, path).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store"); }
      expect(bodies[0]!.code).toBe("RESOURCE_NOT_FOUND"); expect(bodies[0]!.detail).toBe(bodies[1]!.detail);
    }
    const saved = await readFile(journal.path,"utf8"); await writeFile(journal.path,"corrupt");
    try { expect((await app.request("http://127.0.0.1:8787/api/v1/tasks",{headers:{Cookie:cookie}})).status).toBe(503); }
    finally { await writeFile(journal.path,saved); }
  });
  it("persists delete and undo without storing task content or identifiers", async () => {
    const tasks = new TaskRepository(sql, journal);
    const task = await tasks.create(scope, "synthetic-private-title", randomUUID());
    const deleted = await tasks.softDelete(scope, task.id, task.lockVersion, randomUUID());
    const file = await journal.read();
    expect(file.pending).toBe(false);
    expect(file.events.at(-1)?.taskDigest).toBe(recoveryTaskDigest(workspace, task.id));
    const text = await readFile(journal.path, "utf8");
    expect(text).not.toContain(task.id); expect(text).not.toContain(task.title);
    await tasks.restore(scope, task.id, deleted.lockVersion, randomUUID());
    expect((await journal.read()).events.at(-1)?.action).toBe("restore");
  });
  it("blocks missing, corrupt, and pending mismatched files; finalizes an exact committed pending file", async () => {
    const saved = await readFile(journal.path, "utf8");
    await expect(new DeletionJournal(`${journal.path}.missing`).verify(sql)).rejects.toThrow("RECOVERY_RECONCILIATION_REQUIRED");
    await writeFile(journal.path, "broken");
    await expect(journal.verify(sql)).rejects.toThrow("RECOVERY_RECONCILIATION_REQUIRED");
    await writeFile(journal.path, saved);
    const file = JSON.parse(saved); file.pending = true;
    await writeFile(journal.path, JSON.stringify(file));
    await journal.verify(sql); expect((await journal.read()).pending).toBe(false);
    file.epoch = randomUUID(); file.head = createHash("sha256").update(JSON.stringify({ epoch: file.epoch, events: file.events })).digest("hex");
    await writeFile(journal.path, JSON.stringify(file));
    await expect(journal.verify(sql)).rejects.toThrow("RECOVERY_RECONCILIATION_REQUIRED");
    await writeFile(journal.path, saved);
  });
  it("rolls back a delete when persistence fails before database commit", async () => {
    const tasks = new TaskRepository(sql, journal);
    const task = await tasks.create(scope, "synthetic rollback", randomUUID());
    const saved = await readFile(journal.path, "utf8");
    // A directory at the destination prevents atomic replacement after the initial check.
    const { rename, mkdir, rmdir } = await import("node:fs/promises");
    await expect(journal.transaction(sql, async tx => {
      await tx`update core.tasks set deleted_at=now(),purge_after=now()+interval '24 hours' where id=${task.id}`;
      await rename(journal.path, `${journal.path}.rollback`); await mkdir(journal.path);
    })).rejects.toThrow();
    await rmdir(journal.path); await rename(`${journal.path}.rollback`, journal.path);
    expect(await readFile(journal.path, "utf8")).toBe(saved);
    expect((await tasks.get(scope, task.id)).deletedAt).toBeNull();
    await journal.verify(sql);
  });
  it("reconciles an older database snapshot, retaining the closed gate if checkpoint cleanup fails", async () => {
    const task = await new TaskRepository(sql, journal).create(scope, "synthetic old backup", randomUUID());
    await sql`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at) values (${workspace},${task.id},'model','running',${randomUUID()},${randomUUID()},now()+interval '5 minutes')`;
    await sql.end();
    const restoreName = `${databaseName}_restore`;
    await admin.unsafe(`create database ${restoreName} template ${databaseName}`);
    const url = new URL(baseUrl); url.pathname = `/${databaseName}`; sql = connectDatabase(url.href);
    await journal.transaction(sql, async tx => { await tx`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour' where id=${task.id}`; });
    url.pathname = `/${restoreName}`; const restored = connectDatabase(url.href);
    try {
      await expect(journal.verify(restored)).rejects.toThrow("RECOVERY_RECONCILIATION_REQUIRED");
      await expect(journal.reconcile(restored, "0".repeat(64), async () => {})).rejects.toThrow();
      const expected = await fingerprint();
      await expect(journal.reconcile(restored, expected, async () => { throw new Error("CHECKPOINT_DELETE_FAILED"); })).rejects.toThrow("CHECKPOINT_DELETE_FAILED");
      expect((await restored`select 1 from core.tasks where id=${task.id}`).length).toBe(1);
      await expect(journal.verify(restored)).rejects.toThrow();
      await journal.reconcile(restored, expected, async (workspaceId, taskId) => {
        const lease = randomUUID();
        const jobs = await restored<{id:string}[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at) values (${workspaceId},${taskId},'purge','running',${randomUUID()},${lease},now()+interval '5 minutes') returning id`;
        expect((await restored<{purged:boolean}[]>`select ops.purge_task(${jobs[0]!.id},${lease}) as purged`)[0]?.purged).toBe(true);
      });
      expect((await restored`select 1 from core.tasks where id=${task.id}`).length).toBe(0);
      expect((await restored`select 1 from ops.recovery_events where task_digest=${recoveryTaskDigest(workspace, task.id)}`).length).toBe(1);
      await journal.verify(restored);
      const remaining = (await restored<{id:string;workspace_id:string;lock_version:number}[]>`select id,workspace_id,lock_version from core.tasks where deleted_at is null limit 1`)[0]!;
      const prices = {...fakePriceProfile("synthetic-recovery-prices"),mode:"real",generationInput:1,generationOutput:1,embedding:1};
      await expect(restored`select * from ops.enqueue_model_job(${remaining.workspace_id},${remaining.id},${remaining.lock_version},'question_guidance','question-guidance.v1',${"b".repeat(64)},${randomUUID()},'{}',${prices.version},56000,${restored.json(prices)})`).rejects.toThrow("BUDGET_EXCEEDED");
      expect((await restored<{blocked:boolean}[]>`select real_ai_not_before>now()+interval '23 hours' as blocked from ops.recovery_control`)[0]?.blocked).toBe(true);
    } finally { await restored.end(); }
  });
  it("reserves combined generation/embedding money under one concurrent daily limit", async () => {
    const isolatedWorkspace = randomUUID(), task = randomUUID();
    await sql`insert into core.workspaces(id,display_name) values (${isolatedWorkspace},'synthetic prices')`;
    await sql`insert into core.tasks(id,workspace_id,title) values (${task},${isolatedWorkspace},'synthetic budget')`;
    const generationJob = randomUUID();
    await sql`insert into ops.jobs(id,workspace_id,task_id,job_kind,idempotency_key) values (${generationJob},${isolatedWorkspace},${task},'model',${randomUUID()})`;
    await sql`insert into ops.usage_ledger(workspace_id,task_id,job_id,usage_day,usage_kind,status,reserved_cny_micros) values (${isolatedWorkspace},${task},${generationJob},(now() at time zone 'Asia/Shanghai')::date,'generation','reserved',1950000)`;
    const prices = { ...fakePriceProfile("synthetic-real-prices"), mode: "real", generationInput: 1, generationOutput: 1, embedding: 100 };
    const contenders = await Promise.all([0,1].map(async () => {
      const id = randomUUID(), lease = randomUUID();
      await sql`insert into ops.jobs(id,workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at) values (${id},${isolatedWorkspace},${task},'embedding','running',${randomUUID()},${lease},now()+interval '5 minutes')`;
      return { id, lease };
    }));
    const results = await Promise.allSettled(contenders.map(job => sql`select ops.reserve_embedding(${job.id},${job.lease},400,1,${sql.json(prices)})`));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { message: "BUDGET_EXCEEDED" } });
    const winner = contenders[results.findIndex(result => result.status === "fulfilled")]!;
    await expect(sql`select ops.begin_usage(${winner.id},${winner.lease},'embedding',${sql.json({...prices,embedding:99})})`).rejects.toThrow("PRICE_PROFILE_INVALID");
    await sql`select ops.begin_usage(${winner.id},${winner.lease},'embedding',${sql.json(prices)})`;
    await expect(sql`select ops.begin_usage(${winner.id},${winner.lease},'embedding',${sql.json(prices)})`).rejects.toThrow("PROVIDER_RESULT_UNKNOWN");
    expect((await sql`select reserved_cny_micros,status from ops.usage_ledger where job_id=${winner.id}`)[0]).toMatchObject({reserved_cny_micros:"40000",status:"reserved"});
    await sql`select ops.settle_embedding(${winner.id},${winner.lease},1,300)`;
    expect((await sql`select actual_cny_micros,status from ops.usage_ledger where job_id=${winner.id}`)[0]).toMatchObject({actual_cny_micros:"30000",status:"settled"});
  });
  it("freezes real generation rates and refuses under-reservation before enqueue", async () => {
    const task = await new TaskRepository(sql).create(scope, "synthetic priced generation", randomUUID());
    const prices = { ...fakePriceProfile("synthetic-real-prices"), mode: "real", generationInput: 1, generationOutput: 2, embedding: 1 };
    await expect(sql`select * from ops.enqueue_model_job(${workspace},${task.id},${task.lockVersion},'question_guidance','question-guidance.v1',${"b".repeat(64)},${randomUUID()},'{}',${prices.version},0,${sql.json(prices)})`).rejects.toThrow("PRICE_PROFILE_INVALID");
    const queued = await sql<{job_id:string}[]>`select * from ops.enqueue_model_job(${workspace},${task.id},${task.lockVersion},'question_guidance','question-guidance.v1',${"b".repeat(64)},${randomUUID()},'{}',${prices.version},64000,${sql.json(prices)})`;
    const usage = (await sql`select price_profile,reserved_tokens,reserved_cny_micros from ops.usage_ledger where job_id=${queued[0]!.job_id}`)[0];
    expect(usage).toMatchObject({price_profile:prices,reserved_tokens:56000,reserved_cny_micros:"64000"});
  });
  it("requires an explicit new baseline for an existing database and fences real costs", async () => {
    const name = `${databaseName}_baseline`; await admin.unsafe(`create database ${name}`);
    const url = new URL(baseUrl); url.pathname = `/${name}`; const existing = connectDatabase(url.href);
    const protection = new DeletionJournal(`${journal.path}.baseline`);
    try {
      await applyMigrations(existing);
      const tasks = new TaskRepository(existing);
      await tasks.create({workspaceId:await tasks.localWorkspaceId(),sessionId:"synthetic"},"synthetic existing data",randomUUID());
      await expect(protection.initialize(existing)).rejects.toThrow("RECOVERY_RECONCILIATION_REQUIRED");
      await protection.initialize(existing,true); await protection.verify(existing);
      expect((await existing`select 1 from core.tasks`).length).toBe(1);
      expect((await existing<{blocked:boolean}[]>`select real_ai_not_before>now() as blocked from ops.recovery_control`)[0]?.blocked).toBe(true);
    } finally { await existing.end(); }
  });
});
