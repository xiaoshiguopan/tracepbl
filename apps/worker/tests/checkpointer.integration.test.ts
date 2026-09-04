import { Command } from "@langchain/langgraph";
import { afterAll,describe,expect,it,vi } from "vitest";
import { buildProposalGraph } from "@tracepbl/ai";
import { createCheckpointer } from "../src/checkpointer.js";

const databaseUrl=process.env.TRACEPBL_TEST_WORKER_DATABASE_URL;
const checkpointer=databaseUrl?createCheckpointer(databaseUrl):null;
afterAll(async()=>{if(checkpointer)await checkpointer.end();});
(databaseUrl?describe:describe.skip)("PostgreSQL proposal checkpoint replay",()=>{
  it("resumes after teacher input without repeating generation",async()=>{const generateOnce=vi.fn(async()=>({modelRunId:crypto.randomUUID(),generatedRevisionId:crypto.randomUUID()}));const graph=buildProposalGraph({freeze:async()=>({frozen:true}),retrieve:async()=>({retrievalHitIds:["synthetic-hit"]}),generateOnce,validate:async()=>({validated:true})},checkpointer!);const threadId=crypto.randomUUID();const config={configurable:{thread_id:threadId}};const paused=await graph.invoke({taskId:crypto.randomUUID(),inputLockVersion:1,frozen:false,retrievalHitIds:[],modelRunId:"",generatedRevisionId:"",validated:false,decisionId:""},config) as Record<string,unknown>;expect(paused.__interrupt__).toBeDefined();const resumed=await graph.invoke(new Command({resume:"synthetic-decision"}),config);expect(resumed.decisionId).toBe("synthetic-decision");expect(generateOnce).toHaveBeenCalledTimes(1);await checkpointer!.deleteThread(threadId);});
});
