import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const evidence = `/evidence/${new Date().toISOString().replaceAll(":", "-")}`;
mkdirSync(evidence, { recursive: true });
const results = [];
for (const script of ["lint", "typecheck", "test", "test:integration", "test:e2e", "test:stage11", "test:stage12", "build", "audit"]) {
  const env = { ...process.env };
  // Unit suites run first without DB; the dedicated integration gate provisions roles.
  if (script === "test") for (const key of Object.keys(env)) if (key.startsWith("TRACEPBL_TEST_") && key.endsWith("DATABASE_URL")) delete env[key];
  const args = script === "audit" ? ["audit", "--json", "--fetch-retries=0", "--fetch-timeout=20000"] : ["run", script];
  const start = Date.now();
  const result = spawnSync("npm", args, { env, encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
  const filename = `${script.replaceAll(":", "-")}.log`;
  writeFileSync(`${evidence}/${filename}`, log);
  const item = { command: `npm ${args.join(" ")}`, exitCode: result.status, signal: result.signal, durationMs: Date.now() - start, log: `${evidence}/${filename}` };
  results.push(item);
  process.stdout.write(`${JSON.stringify(item)}\n`);
  writeFileSync(`${evidence}/results.json`, JSON.stringify(results, null, 2));
}
process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0;
