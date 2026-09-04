import { initializeCheckpointer } from "./checkpointer.ts";
const databaseUrl = process.env.TRACEPBL_MIGRATOR_DATABASE_URL ?? process.env.TRACEPBL_DATABASE_URL;
if (!databaseUrl) throw new Error("TRACEPBL_MIGRATOR_DATABASE_URL is required");
await initializeCheckpointer(databaseUrl); process.stdout.write("LangGraph checkpointer initialized in agent schema.\n");
