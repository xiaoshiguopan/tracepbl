import { randomUUID } from "node:crypto";
import { connectDatabase, DeletionJournal } from "@tracepbl/repositories";
import { createCheckpointer } from "./checkpointer.ts";
import { purgeTask } from "./handlers.ts";

const url = process.env.TRACEPBL_MIGRATOR_DATABASE_URL;
if (!url) throw new Error("TRACEPBL_MIGRATOR_DATABASE_URL is required");
const sql = connectDatabase(url, 2);
const journal = new DeletionJournal(process.env.TRACEPBL_RECOVERY_JOURNAL);
try {
  if (process.argv[2] === "initialize") await journal.initialize(sql);
  else if (process.argv[2] === "establish-baseline" && process.argv[3] === "--legacy-backups-unrestorable") await journal.initialize(sql, true);
  else if (process.argv[2] === "verify") await journal.verify(sql);
  else if (process.argv[2] === "reconcile" && /^[0-9a-f]{64}$/.test(process.argv[3] ?? "")) {
    const checkpointer = createCheckpointer(url);
    try {
      await journal.reconcile(sql, process.argv[3]!, async (workspaceId, taskId) => {
        const leaseToken = randomUUID();
        const rows = await sql<{ id: string }[]>`insert into ops.jobs(workspace_id,task_id,job_kind,status,idempotency_key,lease_token,lease_expires_at,locked_at,locked_by)
          values (${workspaceId},${taskId},'purge','running',${`recovery-purge:${randomUUID()}`},${leaseToken},now()+interval '10 minutes',now(),'recovery-maintenance') returning id`;
        await purgeTask(sql, checkpointer, { id: rows[0]!.id, workspaceId, taskId, leaseToken }, new AbortController().signal);
      });
    } finally { await checkpointer.end(); }
  } else throw new Error("Use initialize, or reconcile with an independently verified current journal SHA-256");
  process.stdout.write("Recovery protection verified.\n");
} finally { await sql.end(); }
