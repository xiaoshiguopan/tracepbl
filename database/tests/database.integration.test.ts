import postgres, { type Sql } from "postgres";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../scripts/database.js";

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
    expect(relations[0]?.count).toBe(28);
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
    const deletedAt = new Date("2026-09-03T00:00:00.000Z");
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
    const hits = await sql<{ chunk_id: number }[]>`select chunk_id from rag.chunk_embeddings order by embedding <=> ${`[${unit.join(",")}]`}::vector limit 2`;
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
