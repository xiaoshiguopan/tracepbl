import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connect, migrationsDirectory } from "./database.ts";

const sql = connect();
try {
  const source = await readFile(join(migrationsDirectory, "0002_seed_defaults.sql"), "utf8");
  await sql.begin((tx) => tx.unsafe(source));
  process.stdout.write("Synthetic/default seed applied idempotently.\n");
} finally {
  await sql.end();
}
