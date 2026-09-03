import { applyMigrations, connect } from "./database.ts";

const sql = connect();
try {
  await applyMigrations(sql);
  const head = await sql<{ name: string }[]>`select name from tracepbl_meta.schema_migrations order by name desc limit 1`;
  process.stdout.write(`Database migrated to ${head[0]?.name ?? "empty"}.\n`);
} finally {
  await sql.end();
}
