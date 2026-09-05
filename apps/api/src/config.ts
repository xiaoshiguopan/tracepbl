import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  host: z.enum(["127.0.0.1", "0.0.0.0"]),
  port: z.int().min(1024).max(65535),
  allowedOrigin: z.string().regex(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/),
  databaseUrl: z.string().min(1),
  sessionSecret: z.string().min(43),
  mode: z.enum(["local", "ci"]),
  aiConfigured: z.boolean(),
  providerMode: z.enum(["disabled", "fake", "real"]).default("disabled"),
  urlFetchEnabled: z.boolean(),
  priceProfileVersion: z.string().min(1).nullable(),
  generationReservationCnyMicros: z.int().min(0).max(2_000_000),
}).strict();
export type ApiConfig = z.input<typeof ConfigSchema>;

export async function loadOrCreateSecret(path = resolve(".tracepbl/session-secret")) {
  try { return (await readFile(path, "utf8")).trim(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const secret = randomBytes(32).toString("base64url");
    await mkdir(dirname(path), { recursive: true });
    try { await writeFile(path, `${secret}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); return secret; }
    catch (writeError) { if ((writeError as NodeJS.ErrnoException).code === "EEXIST") return (await readFile(path, "utf8")).trim(); throw writeError; }
  }
}

export async function loadConfig(env = process.env): Promise<ApiConfig> {
  const sessionSecret = env.TRACEPBL_SESSION_SECRET ?? await loadOrCreateSecret(env.TRACEPBL_SESSION_SECRET_FILE);
  const providerMode = env.TRACEPBL_PROVIDER_MODE ?? "disabled";
  const priceProfileVersion = providerMode === "fake" ? "synthetic-zero-cost.v1" : env.TRACEPBL_PRICE_PROFILE_VERSION ?? null;
  return ConfigSchema.parse({ host: env.TRACEPBL_API_HOST ?? "127.0.0.1", port: Number(env.TRACEPBL_API_PORT ?? 8787), allowedOrigin: env.TRACEPBL_ALLOWED_ORIGIN ?? "http://127.0.0.1:5173", databaseUrl: env.TRACEPBL_APP_DATABASE_URL ?? env.TRACEPBL_DATABASE_URL, sessionSecret, mode: env.TRACEPBL_MODE ?? "local", providerMode, aiConfigured: providerMode === "fake" || (providerMode === "real" && Boolean(env.TRACEPBL_GLM_API_KEY && priceProfileVersion && env.TRACEPBL_AI_ENABLED !== "false")), urlFetchEnabled: env.TRACEPBL_URL_FETCH_ENABLED === "true", priceProfileVersion, generationReservationCnyMicros: Number(env.TRACEPBL_GENERATION_RESERVATION_CNY_MICROS ?? 0) });
}
