import { serve } from "@hono/node-server";
import { connectDatabase, DeletionJournal } from "@tracepbl/repositories";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = await loadConfig(); const database = connectDatabase(config.databaseUrl); const recovery = new DeletionJournal(config.recoveryJournalPath); await recovery.verify(database); const app = createApp(database, config, recovery);
const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => process.stdout.write(`${JSON.stringify({ level: "info", event: "api.started", host: config.host, port: info.port })}\n`));
async function shutdown() { server.close(); await database.end({ timeout: 5 }); }
process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
