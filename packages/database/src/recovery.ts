import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import type { TransactionSql } from "postgres";
import type { Database } from "./index.ts";

type Transaction = TransactionSql<Record<string, never>>;
export type RecoveryEvent = { seq: string; taskDigest: string; action: "delete" | "restore"; purgeAfterMs: number | null };
export type RecoverySnapshot = { epoch: string; events: RecoveryEvent[] };
export type RecoveryFile = RecoverySnapshot & { schemaVersion: 1; head: string; pending: boolean };
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const defaultRecoveryPath = () => resolve(homedir(), ".tracepbl-recovery", "deletion-journal.json");
export const recoveryTaskDigest = (workspace: string, task: string) => createHash("sha256").update(`${workspace}:${task}`).digest("hex");
export class RecoveryRequired extends Error { constructor() { super("RECOVERY_RECONCILIATION_REQUIRED"); } }
function outsideRepository(path: string) {
  const rel = relative(repositoryRoot, path);
  if (!isAbsolute(path) || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) throw new RecoveryRequired();
}
export async function recoverySnapshot(sql: Database | Transaction): Promise<RecoverySnapshot & { initialized: boolean; reconciling: boolean }> {
  const state = await sql<{ epoch: string; initialized: boolean; reconciling: boolean }[]>`select epoch,initialized,reconciling from ops.recovery_control where singleton`;
  if (!state[0]) throw new RecoveryRequired();
  const rows = await sql<{ seq: string; task_digest: string; action: "delete" | "restore"; purge_after_ms: string | null }[]>`select seq::text,task_digest,action,purge_after_ms::text from ops.recovery_events order by seq`;
  return { ...state[0], events: rows.map(row => ({ seq: row.seq, taskDigest: row.task_digest, action: row.action, purgeAfterMs: row.purge_after_ms === null ? null : Number(row.purge_after_ms) })) };
}
export class DeletionJournal {
  readonly path: string;
  constructor(path = defaultRecoveryPath()) { this.path = resolve(path); outsideRepository(this.path); }
  async read(expectedFileSha256?: string): Promise<RecoveryFile> {
    try {
      outsideRepository(await realpath(this.path));
      if ((await lstat(this.path)).isSymbolicLink() || (await stat(this.path)).size > 16_777_216) throw new RecoveryRequired();
      const text = await readFile(this.path, "utf8");
      if (expectedFileSha256 && (!/^[0-9a-f]{64}$/.test(expectedFileSha256) || createHash("sha256").update(text).digest("hex") !== expectedFileSha256)) throw new RecoveryRequired();
      const value = JSON.parse(text) as RecoveryFile;
      if (value.schemaVersion !== 1 || typeof value.epoch !== "string" || !/^[0-9a-f-]{36}$/.test(value.epoch) || typeof value.pending !== "boolean" || !Array.isArray(value.events)) throw new RecoveryRequired();
      let seq = 0n;
      for (const event of value.events) {
        if (!/^\d+$/.test(event.seq) || BigInt(event.seq) <= seq || !/^[0-9a-f]{64}$/.test(event.taskDigest) || !["delete", "restore"].includes(event.action) || (event.action === "restore" ? event.purgeAfterMs !== null : !Number.isSafeInteger(event.purgeAfterMs) || event.purgeAfterMs! <= 0)) throw new RecoveryRequired();
        seq = BigInt(event.seq);
      }
      if (value.head !== hash({ epoch: value.epoch, events: value.events })) throw new RecoveryRequired();
      return value;
    } catch { throw new RecoveryRequired(); }
  }
  private async write(snapshot: RecoverySnapshot, pending: boolean) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    outsideRepository(await realpath(dirname(this.path)));
    const temp = `${this.path}.${randomUUID()}.tmp`;
    const text = JSON.stringify({ schemaVersion: 1, epoch: snapshot.epoch, events: snapshot.events, head: hash({ epoch: snapshot.epoch, events: snapshot.events }), pending }) + "\n";
    if (Buffer.byteLength(text) > 16_777_216) throw new RecoveryRequired();
    const handle = await open(temp, "wx", 0o600);
    try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temp, this.path); } catch (error) { await unlink(temp).catch(() => undefined); throw error; }
    // POSIX requires syncing the directory entry after rename; Windows has no directory fsync.
    if (process.platform !== "win32") { const directory = await open(dirname(this.path), "r"); try { await directory.sync(); } finally { await directory.close(); } }
  }
  async initialize(sql: Database, acknowledgeLegacyBackupsUnrestorable = false) {
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(120012)`;
      const state = await recoverySnapshot(tx);
      if (state.initialized) { await this.check(tx); return; }
      const tasks = await tx`select 1 from core.tasks limit 1`;
      if (!acknowledgeLegacyBackupsUnrestorable && (tasks.length || state.events.length)) throw new RecoveryRequired();
      try { await lstat(this.path); throw new RecoveryRequired(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await this.write(state, true);
      await tx`update ops.recovery_control set initialized=true,real_ai_not_before=case when ${acknowledgeLegacyBackupsUnrestorable} then now()+interval '24 hours' else real_ai_not_before end where singleton`;
    });
    await this.verify(sql);
  }
  private async check(tx: Transaction, allowMaintenance = false) {
    const state = await recoverySnapshot(tx); const file = await this.read();
    if (!state.initialized || (!allowMaintenance && state.reconciling) || file.head !== hash({ epoch: state.epoch, events: state.events })) throw new RecoveryRequired();
    if (file.pending) await this.write(state, false);
    return state;
  }
  async verify(sql: Database, allowMaintenance = false) {
    await sql.begin(async tx => { await tx`select pg_advisory_xact_lock(120012)`; await this.check(tx, allowMaintenance); });
  }
  async transaction<T>(sql: Database, operation: (tx: Transaction) => Promise<T>): Promise<T> {
    const result = await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(120012)`;
      const before = await this.check(tx);
      const value = await operation(tx);
      const after = await recoverySnapshot(tx);
      if (hash(before.events) !== hash(after.events)) await this.write(after, true);
      return value;
    });
    await this.verify(sql);
    return result as T;
  }
  async reconcile(sql: Database, expectedFileSha256: string, purge: (workspaceId: string, taskId: string) => Promise<void>) {
    // Caller runs offline against a newly restored database with maintenance credentials.
    const file = await this.read(expectedFileSha256);
    if (file.pending) throw new RecoveryRequired();
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(120012)`;
      const saved = await recoverySnapshot(tx);
      if (!saved.initialized || saved.epoch !== file.epoch || saved.events.length > file.events.length || hash(saved.events) !== hash(file.events.slice(0, saved.events.length))) throw new RecoveryRequired();
      await tx`update ops.recovery_control set reconciling=true,real_ai_not_before=greatest(real_ai_not_before,now()+interval '24 hours') where singleton`;
    });
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(120012)`;
      const saved = await recoverySnapshot(tx);
      for (const event of file.events.slice(saved.events.length)) await tx`insert into ops.recovery_events(seq,task_digest,action,purge_after_ms) overriding system value values (${event.seq},${event.taskDigest},${event.action},${event.purgeAfterMs})`;
      if (file.events.length) await tx`select setval('ops.recovery_events_seq_seq',${file.events.at(-1)!.seq}::bigint,true)`;
      // Restored queues must not replay old model calls or publish stale results.
      await tx`update ops.jobs set status='cancelled',wait_state=null,lease_token=null,lease_expires_at=null,error_code='RECOVERY_RECONCILIATION_REQUIRED' where status in ('queued','running')`;
      const latest = new Map(file.events.map(event => [event.taskDigest, event]));
      const tasks = await tx<{ id: string; workspace_id: string }[]>`select id,workspace_id from core.tasks`;
      for (const task of tasks) {
        const event = latest.get(recoveryTaskDigest(task.workspace_id, task.id));
        if (!event) continue;
        if (event.action === "restore") await tx`update core.tasks set deleted_at=null,purge_after=null where id=${task.id} and workspace_id=${task.workspace_id}`;
        else {
          const deadline = new Date(event.purgeAfterMs!);
          await tx`update core.tasks set deleted_at=${deadline}::timestamptz-interval '24 hours',purge_after=${deadline} where id=${task.id} and workspace_id=${task.workspace_id}`;
          await tx`select ops.schedule_task_purge(${task.workspace_id},${task.id},${`recovery:${randomUUID()}`})`;
        }
      }
    });
    const overdue = await sql<{ id: string; workspace_id: string }[]>`select id,workspace_id from core.tasks where deleted_at is not null and purge_after<=now()`;
    for (const task of overdue) await purge(task.workspace_id, task.id);
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(120012)`;
      await this.check(tx, true);
      if ((await tx`select 1 from core.tasks where deleted_at is not null and purge_after<=now() limit 1`).length) throw new RecoveryRequired();
      await tx`update ops.recovery_control set reconciling=false where singleton`;
    });
  }
}
