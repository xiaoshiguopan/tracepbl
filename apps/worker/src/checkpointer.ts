import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import postgres from "postgres";

export function createCheckpointer(databaseUrl: string) { return PostgresSaver.fromConnString(databaseUrl, { schema: "agent" }); }
export async function initializeCheckpointer(databaseUrl: string) {
  const saver = createCheckpointer(databaseUrl); await saver.setup();
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe(`do $ownership$ declare item record; begin
      for item in select tablename from pg_tables where schemaname='agent' loop execute format('alter table agent.%I owner to tracepbl_owner',item.tablename); end loop;
      for item in select sequencename from pg_sequences where schemaname='agent' loop execute format('alter sequence agent.%I owner to tracepbl_owner',item.sequencename); end loop;
    end $ownership$`);
    await sql.unsafe("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA agent TO tracepbl_worker; GRANT SELECT ON ALL TABLES IN SCHEMA agent TO tracepbl_backup; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA agent TO tracepbl_worker,tracepbl_backup;");
    await sql`insert into ops.runtime_components(component,version) values ('langgraph_checkpointer','1.0.5') on conflict(component) do update set version=excluded.version,initialized_at=now()`;
  } finally { await sql.end(); await saver.end(); }
}
