import { syntheticProposal } from "./synthetic-proposals.ts";
import { randomUUID } from "node:crypto";
import { DisabledAiProvider, FakeAiProvider, GlmProvider, type AiProvider } from "@tracepbl/ai";
import { connectDatabase, JobRepository } from "@tracepbl/repositories";
import { createCheckpointer } from "./checkpointer.ts";
import { createHandlers } from "./handlers.ts";
import { WorkerRunner } from "./runner.ts";
import { loadWorkerConfig } from "./config.ts";

const config=loadWorkerConfig();const sql = connectDatabase(config.databaseUrl, 4); const repository = new JobRepository(sql); const checkpointer=createCheckpointer(config.databaseUrl);
let provider:AiProvider=new DisabledAiProvider();
if(config.providerMode==="fake") provider=new FakeAiProvider(syntheticProposal);
if(config.providerMode==="real") provider=new GlmProvider(config.glmApiKey!);
const runner = new WorkerRunner(repository, `worker-${randomUUID()}`, createHandlers({sql,jobs:repository,provider,checkpointer,urlFetchEnabled:config.urlFetchEnabled,actualCostMicros:(inputTokens,outputTokens)=>Math.ceil((inputTokens*config.generationInputCnyPerMillion+outputTokens*config.generationOutputCnyPerMillion))}));
let stopping = false; const stop = () => { stopping = true; }; process.once("SIGINT", stop); process.once("SIGTERM", stop);
while (!stopping) { const worked = await runner.runOnce(); if (!worked) await new Promise((resolve) => setTimeout(resolve, 2_000)); }
await checkpointer.end(); await sql.end({ timeout: 5 });
