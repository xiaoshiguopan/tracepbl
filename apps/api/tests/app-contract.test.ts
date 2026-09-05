import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { Database } from "@tracepbl/repositories";
import { createApp } from "../src/app.js";
import type { ApiConfig } from "../src/config.js";

const unusedDatabase = (() => { throw new Error("database should not be reached"); }) as unknown as Database;
const config = { host: "127.0.0.1", port: 8787, allowedOrigin: "http://127.0.0.1:5173", databaseUrl: "postgres://unused", sessionSecret: "x".repeat(43), mode: "ci", aiConfigured: false, urlFetchEnabled: false, priceProfileVersion: null, generationReservationCnyMicros: 0 } satisfies ApiConfig;

describe("HTTP contract", () => {
  it("keeps diagnostic exception contents out of responses and application logs", async () => {
    const marker = "synthetic-private-diagnostic-marker";
    const failingDatabase = (() => { throw new Error(marker); }) as unknown as Database;
    const log = vi.spyOn(console,"error").mockImplementation(() => undefined);
    try {
      const response = await createApp(failingDatabase,config).request("http://127.0.0.1:8787/api/v1/runtime");
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain(marker);
      expect(log).toHaveBeenCalled(); expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
    } finally { log.mockRestore(); }
  });
  it("does not let a new session bypass the workspace burst limit", async () => {
    const app = createApp(unusedDatabase, config);
    const cookie = () => {
      const payload = Buffer.from(JSON.stringify({ workspaceId: "01991200-0000-7000-8000-000000000010", sessionId: crypto.randomUUID(), expiresAt: Date.now() + 60000 })).toString("base64url");
      return `tracepbl_local_session=${payload}.${createHmac("sha256", config.sessionSecret).update(payload).digest("base64url")}`;
    };
    for (let index = 0; index < 300; index++) expect((await app.request("http://127.0.0.1:8787/api/v1/unused", { headers: { Cookie: cookie() } })).status).toBe(404);
    expect((await app.request("http://127.0.0.1:8787/api/v1/unused", { headers: { Cookie: cookie() } })).status).toBe(429);
  });
  it("limits a request burst before database work and recovers after the window", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    try {
      const app = createApp(unusedDatabase, config);
      for (let index = 0; index < 600; index++) expect((await app.request("http://127.0.0.1:8787/api/v1/tasks")).status).toBe(401);
      const denied = await app.request("http://127.0.0.1:8787/api/v1/tasks");
      expect(denied.status).toBe(429);
      expect(denied.headers.get("retry-after")).toBe("60");
      expect(denied.headers.get("cache-control")).toBe("no-store");
      clock.mockReturnValue(160_000);
      expect((await app.request("http://127.0.0.1:8787/api/v1/tasks")).status).toBe(401);
    } finally { clock.mockRestore(); }
  });
  it("never caches private API responses, including denied requests", async () => {
    const response = await createApp(unusedDatabase, config).request("http://127.0.0.1:8787/api/v1/tasks");
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("publishes OpenAPI 3.1 with unique operation ids", async () => {
    const response = await createApp(unusedDatabase, { ...config, host: "0.0.0.0" }).request("http://127.0.0.1:8787/openapi.json"); const document = await response.json() as { openapi: string; servers: {url:string}[]; paths: Record<string, Record<string, { operationId?: string }>> };
    expect(document.openapi).toBe("3.1.0"); expect(document.servers).toEqual([{url:"http://127.0.0.1:8787"}]); const ids = Object.values(document.paths).flatMap((path) => Object.values(path).map((operation) => operation.operationId).filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
    for(const path of ["/api/v1/runtime","/api/v1/tasks","/api/v1/tasks/{taskId}","/api/v1/tasks/{taskId}/copies","/api/v1/tasks/{taskId}/context","/api/v1/tasks/{taskId}/question-set","/api/v1/tasks/{taskId}/sources","/api/v1/tasks/{taskId}/materials","/api/v1/tasks/{taskId}/source-selection","/api/v1/tasks/{taskId}/evidence-map","/api/v1/tasks/{taskId}/lesson-design","/api/v1/tasks/{taskId}/rubric","/api/v1/tasks/{taskId}/proposals","/api/v1/tasks/{taskId}/proposals/{revisionId}","/api/v1/tasks/{taskId}/proposals/{revisionId}/adoption","/api/v1/tasks/{taskId}/audits","/api/v1/tasks/{taskId}/audits/{runId}","/api/v1/tasks/{taskId}/decisions","/api/v1/tasks/{taskId}/exports","/api/v1/tasks/{taskId}/exports/{exportId}/manifest","/api/v1/tasks/{taskId}/restorations","/api/v1/tasks/{taskId}/operations/{operationId}","/api/v1/tasks/{taskId}/events"])expect(document.paths[path],path).toBeDefined();
  });
  it("uses the same safe problem for a missing session", async () => {
    const response = await createApp(unusedDatabase, config).request(`http://127.0.0.1:8787/api/v1/tasks/${crypto.randomUUID()}`); const body = await response.json();
    expect(response.status).toBe(401); expect(body).toMatchObject({ code: "SESSION_REQUIRED" }); expect(JSON.stringify(body)).not.toContain("workspace");
  });
});
