import { z } from "zod";

const WorkerConfigSchema=z.object({
  databaseUrl:z.url(),
  providerMode:z.enum(["disabled","fake","real"]),
  urlFetchEnabled:z.boolean(),
  priceProfileVersion:z.string().min(1).nullable(),
  glmApiKey:z.string().min(1).nullable(),
  generationInputCnyPerMillion:z.number().finite().nonnegative(),
  generationOutputCnyPerMillion:z.number().finite().nonnegative(),
}).strict().superRefine((value,context)=>{
  if(value.providerMode==="real"&&(!value.glmApiKey||!value.priceProfileVersion||value.generationInputCnyPerMillion<=0||value.generationOutputCnyPerMillion<=0))context.addIssue({code:"custom",message:"Real provider requires an explicit key, verified price profile, and positive CNY token rates"});
});

export type WorkerConfig=z.infer<typeof WorkerConfigSchema>;
export function loadWorkerConfig(env=process.env):WorkerConfig{return WorkerConfigSchema.parse({
  databaseUrl:env.TRACEPBL_WORKER_DATABASE_URL??env.TRACEPBL_DATABASE_URL,
  providerMode:env.TRACEPBL_PROVIDER_MODE??"disabled",
  urlFetchEnabled:env.TRACEPBL_URL_FETCH_ENABLED==="true",
  priceProfileVersion:env.TRACEPBL_PRICE_PROFILE_VERSION??null,
  glmApiKey:env.TRACEPBL_GLM_API_KEY??null,
  generationInputCnyPerMillion:Number(env.TRACEPBL_GENERATION_INPUT_CNY_PER_MILLION??0),
  generationOutputCnyPerMillion:Number(env.TRACEPBL_GENERATION_OUTPUT_CNY_PER_MILLION??0),
});}
