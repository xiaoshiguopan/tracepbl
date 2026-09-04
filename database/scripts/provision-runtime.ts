import { connect } from "./database.ts";
const appPassword=process.env.TRACEPBL_APP_DB_PASSWORD; const workerPassword=process.env.TRACEPBL_WORKER_DB_PASSWORD;
if(!appPassword||!workerPassword||appPassword.length<32||workerPassword.length<32||appPassword===workerPassword) throw new Error("Runtime database passwords must be distinct and at least 32 characters");
const sql=connect(process.env.TRACEPBL_MIGRATOR_DATABASE_URL ?? process.env.TRACEPBL_DATABASE_URL);
try {
  const commands=await sql<{command:string}[]>`select format('alter role tracepbl_app login password %L',${appPassword}::text) as command union all select format('alter role tracepbl_worker login password %L',${workerPassword}::text)`;
  for(const item of commands) await sql.unsafe(item.command);
  process.stdout.write("Runtime database roles provisioned.\n");
} finally { await sql.end(); }
