import { describe,expect,it } from "vitest";
import { loadWorkerConfig } from "../src/config.js";

describe("worker startup configuration",()=>{
  it("starts safely without an AI key",()=>{expect(loadWorkerConfig({TRACEPBL_WORKER_DATABASE_URL:"postgres://worker:pass@localhost/tracepbl"})).toMatchObject({providerMode:"disabled",urlFetchEnabled:false});});
  it("fails closed when real provider pricing is incomplete",()=>{expect(()=>loadWorkerConfig({TRACEPBL_WORKER_DATABASE_URL:"postgres://worker:pass@localhost/tracepbl",TRACEPBL_PROVIDER_MODE:"real",TRACEPBL_GLM_API_KEY:"synthetic-key",TRACEPBL_PRICE_PROFILE_VERSION:"test"})).toThrow(/positive CNY token rates/);});
});
