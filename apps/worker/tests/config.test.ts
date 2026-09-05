import { describe,expect,it } from "vitest";
import { loadWorkerConfig } from "../src/config.js";

describe("worker startup configuration",()=>{
  it("honors the real AI kill switch even with complete synthetic configuration", () => {
    expect(loadWorkerConfig({ TRACEPBL_WORKER_DATABASE_URL: "postgres://unused/test", TRACEPBL_PROVIDER_MODE: "real", TRACEPBL_AI_ENABLED: "false", TRACEPBL_GLM_API_KEY: "synthetic-key", TRACEPBL_PRICE_PROFILE_VERSION: "synthetic-price", TRACEPBL_GENERATION_INPUT_CNY_PER_MILLION: "1", TRACEPBL_GENERATION_OUTPUT_CNY_PER_MILLION: "1" }).providerMode).toBe("disabled");
  });
  it("keeps fake generation available with real AI disabled", () => {
    expect(loadWorkerConfig({ TRACEPBL_WORKER_DATABASE_URL: "postgres://unused/test", TRACEPBL_PROVIDER_MODE: "fake", TRACEPBL_AI_ENABLED: "false" }).providerMode).toBe("fake");
  });
  it("starts safely without an AI key",()=>{expect(loadWorkerConfig({TRACEPBL_WORKER_DATABASE_URL:"postgres://worker:pass@localhost/tracepbl"})).toMatchObject({providerMode:"disabled",urlFetchEnabled:false});});
  it("fails closed when real provider pricing is incomplete",()=>{expect(()=>loadWorkerConfig({TRACEPBL_WORKER_DATABASE_URL:"postgres://worker:pass@localhost/tracepbl",TRACEPBL_PROVIDER_MODE:"real",TRACEPBL_GLM_API_KEY:"synthetic-key",TRACEPBL_PRICE_PROFILE_VERSION:"test"})).toThrow(/positive CNY token rates/);});
});
