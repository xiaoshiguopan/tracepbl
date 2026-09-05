import { generationCost } from "@tracepbl/domain";
import { syntheticProposal } from "./synthetic-proposals.ts";
import { randomUUID } from "node:crypto";
import { DisabledAiProvider, FakeAiProvider, GlmProvider, type AiProvider } from "@tracepbl/ai";
import { connectDatabase, DeletionJournal, JobRepository } from "@tracepbl/repositories";
import { createCheckpointer } from "./checkpointer.ts";
import { createHandlers } from "./handlers.ts";
import { WorkerRunner } from "./runner.ts";
import { loadWorkerConfig } from "./config.ts";

const config=loadWorkerConfig();const sql = connectDatabase(config.databaseUrl, 4); const repository = new JobRepository(sql); const checkpointer=createCheckpointer(config.databaseUrl);
const recovery = new DeletionJournal(config.recoveryJournalPath); await recovery.verify(sql);
let provider:AiProvider=new DisabledAiProvider();
if(config.providerMode==="fake") provider=new FakeAiProvider(syntheticProposal);
if(config.providerMode==="real") provider=new GlmProvider(config.glmApiKey!);
const runner = new WorkerRunner(repository, `worker-${randomUUID()}`, createHandlers({sql,jobs:repository,provider,checkpointer,urlFetchEnabled:config.urlFetchEnabled,priceProfile:config.priceProfile,actualCostMicros:(inputTokens,outputTokens)=>generationCost(config.priceProfile,inputTokens,outputTokens)}));
let stopping = false; const stop = () => { stopping = true; }; process.once("SIGINT", stop); process.once("SIGTERM", stop);
while (!stopping) { await recovery.verify(sql); const worked = await runner.runOnce(); if (!worked) await new Promise((resolve) => setTimeout(resolve, 2_000)); }
await checkpointer.end(); await sql.end({ timeout: 5 });
