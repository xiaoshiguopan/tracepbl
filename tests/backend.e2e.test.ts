import postgres, { type Sql } from "postgres";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeAiProvider } from "@tracepbl/ai";
import { connectDatabase, JobRepository, type Database } from "@tracepbl/repositories";
import { createApp } from "../apps/api/src/app.js";
import type { ApiConfig } from "../apps/api/src/config.js";
import { createCheckpointer, initializeCheckpointer } from "../apps/worker/src/checkpointer.js";
import { createHandlers } from "../apps/worker/src/handlers.js";
import { WorkerRunner } from "../apps/worker/src/runner.js";
import { applyMigrations } from "../database/scripts/database.js";

let container: StartedTestContainer | undefined;
let owner: Sql;
let appDb: Database;
let workerDb: Database;
let checkpointer: ReturnType<typeof createCheckpointer>;
const appPassword = "synthetic-e2e-app-password-000000000001";
const workerPassword = "synthetic-e2e-worker-password-00000001";

beforeAll(async () => {
  let ownerUrl = process.env.TRACEPBL_TEST_DATABASE_URL;
  if (!ownerUrl) {
    container = await new GenericContainer("pgvector/pgvector:0.8.6-pg18-bookworm")
      .withEnvironment({ POSTGRES_DB: "tracepbl", POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres" })
      .withExposedPorts(5432).withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/).withStartupTimeout(120_000)).start();
    ownerUrl = `postgres://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/tracepbl`;
  }
  owner = postgres(ownerUrl, { max: 2, onnotice: () => undefined });
  await applyMigrations(owner);
  const commands = await owner<{ command: string }[]>`select format('alter role tracepbl_app login password %L',${appPassword}::text) as command union all select format('alter role tracepbl_worker login password %L',${workerPassword}::text)`;
  for (const item of commands) await owner.unsafe(item.command);
  await initializeCheckpointer(ownerUrl);
  const parsed = new URL(ownerUrl); const host = parsed.hostname; const port = parsed.port || "5432";
  appDb = connectDatabase(`postgres://tracepbl_app:${appPassword}@${host}:${port}/tracepbl`, 2);
  workerDb = connectDatabase(`postgres://tracepbl_worker:${workerPassword}@${host}:${port}/tracepbl`, 2);
  checkpointer = createCheckpointer(`postgres://tracepbl_worker:${workerPassword}@${host}:${port}/tracepbl`);
}, 180_000);

afterAll(async () => {
  if (checkpointer) await checkpointer.end();
  if (appDb) await appDb.end();
  if (workerDb) await workerDb.end();
  if (owner) await owner.end();
  if (container) await container.stop();
});

describe("local backend end to end", () => {
  it("moves an audit from HTTP enqueue through Worker completion to HTTP read", async () => {
    const config = { host: "127.0.0.1", port: 8787, allowedOrigin: "http://127.0.0.1:5173", databaseUrl: "synthetic", sessionSecret: "e".repeat(43), mode: "ci", aiConfigured: false, urlFetchEnabled: false, priceProfileVersion: null, generationReservationCnyMicros: 0 } satisfies ApiConfig;
    const app = createApp(appDb, config);
    const runtime = await app.request("http://127.0.0.1:8787/api/v1/runtime");
    const cookie = runtime.headers.get("set-cookie")!.split(";", 1)[0]!;
    const write = { Cookie: cookie, Origin: config.allowedOrigin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
    const created = await app.request("http://127.0.0.1:8787/api/v1/tasks", { method: "POST", headers: { ...write, "Idempotency-Key": `e2e-create-${crypto.randomUUID()}` }, body: JSON.stringify({ title: "合成端到端任务" }) });
    expect(created.status).toBe(201);
    const task = await created.json() as { id: string };
    const audit = await app.request(`http://127.0.0.1:8787/api/v1/tasks/${task.id}/audits`, { method: "POST", headers: { ...write, "If-Match": created.headers.get("etag")!, "Idempotency-Key": `e2e-audit-${crypto.randomUUID()}` }, body: JSON.stringify({ baseLockVersion: 0 }) });
    expect(audit.status).toBe(202);
    const queued = await audit.json() as { runId: string; operation: { id: string } };
    const jobs = new JobRepository(workerDb);
    const handlers = createHandlers({ sql: workerDb, jobs, provider: new FakeAiProvider(), checkpointer, urlFetchEnabled: false, actualCostMicros: () => 0 });
    const runner=new WorkerRunner(jobs,"e2e-worker",handlers);let operationBody:{status:string}|undefined;
    for(let attempt=0;attempt<20;attempt+=1){expect(await runner.runOnce()).toBe(true);const operation=await app.request(`http://127.0.0.1:8787/api/v1/tasks/${task.id}/operations/${queued.operation.id}`,{headers:{Cookie:cookie}});operationBody=await operation.json() as {status:string};if(!["queued","running"].includes(operationBody.status))break;}
    expect(operationBody).toMatchObject({ status: "succeeded" });
    const result = await app.request(`http://127.0.0.1:8787/api/v1/tasks/${task.id}/audits/${queued.runId}`, { headers: { Cookie: cookie } });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ id: queued.runId, status: "succeeded", summary: { blocking: 1, pass: false } });
    await owner`delete from core.tasks where id=${task.id}`;
  });
});
