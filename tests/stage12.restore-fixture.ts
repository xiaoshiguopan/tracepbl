import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connectDatabase, DeletionJournal, TaskRepository } from "@tracepbl/repositories";
import { applyMigrations } from "../database/scripts/database.ts";
import { initializeCheckpointer } from "../apps/worker/src/checkpointer.ts";

const url = process.env.TRACEPBL_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/stage12_dump_")) throw new Error("Use a stage12_dump_ synthetic drill database only");
const sql = connectDatabase(url);
const journal = new DeletionJournal(process.env.TRACEPBL_RECOVERY_JOURNAL);
try {
  if (process.argv[2] === "prepare") {
    await applyMigrations(sql); await initializeCheckpointer(url); await journal.initialize(sql);
    const tasks = new TaskRepository(sql, journal);
    await tasks.create({workspaceId:await tasks.localWorkspaceId(),sessionId:"synthetic-drill"},"合成旧备份恢复验证","stage12-dump-task");
  } else if (process.argv[2] === "expire") {
    await journal.transaction(sql, async tx => { await tx`update core.tasks set deleted_at=now()-interval '25 hours',purge_after=now()-interval '1 hour'`; });
  } else if (process.argv[2] === "fingerprint") {
    process.stdout.write(createHash("sha256").update(await readFile(journal.path)).digest("hex"));
  } else if (process.argv[2] === "assert-blocked") {
    let blocked = false; try { await journal.verify(sql); } catch { blocked = true; }
    if (!blocked) throw new Error("Old backup unexpectedly passed recovery protection");
    process.stdout.write("Old backup correctly blocked.\n");
  } else if (process.argv[2] === "assert-purged") {
    await journal.verify(sql);
    if ((await sql`select 1 from core.tasks`).length || (await sql`select 1 from ops.recovery_events`).length !== 1) throw new Error("Deletion reconciliation did not purge the restored task");
    process.stdout.write("Restored task count 0; independent deletion history retained.\n");
  } else throw new Error("Unknown drill operation");
} finally { await sql.end(); }
