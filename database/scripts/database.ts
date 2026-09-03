import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";

const databaseRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const migrationsDirectory = join(databaseRoot, "migrations");

export function connect(databaseUrl = process.env.TRACEPBL_DATABASE_URL) {
  if (!databaseUrl) throw new Error("TRACEPBL_DATABASE_URL is required");
  return postgres(databaseUrl, { max: 1, onnotice: () => undefined });
}

export async function migrationFiles() {
  return (await readdir(migrationsDirectory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
}

export async function applyMigrations(sql: Sql) {
  const version = await sql<{ server_version_num: string }[]>`show server_version_num`;
  if (!version[0]?.server_version_num.startsWith("18")) throw new Error(`PostgreSQL 18.x required; received ${version[0]?.server_version_num ?? "unknown"}`);
  await sql`create schema if not exists tracepbl_meta`;
  await sql`create table if not exists tracepbl_meta.schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;

  for (const name of await migrationFiles()) {
    const source = await readFile(join(migrationsDirectory, name), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const recorded = await sql<{ checksum: string }[]>`select checksum from tracepbl_meta.schema_migrations where name=${name}`;
    if (recorded[0]) {
      if (recorded[0].checksum !== checksum) throw new Error(`Archived migration changed: ${name}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`insert into tracepbl_meta.schema_migrations(name,checksum) values (${name},${checksum})`;
    });
  }

  const extension = await sql<{ extversion: string }[]>`select extversion from pg_extension where extname='vector'`;
  if (extension[0]?.extversion !== "0.8.6") throw new Error(`pgvector 0.8.6 required; received ${extension[0]?.extversion ?? "missing"}`);
}
