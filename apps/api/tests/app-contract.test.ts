import { describe, expect, it } from "vitest";
import type { Database } from "@tracepbl/repositories";
import { createApp } from "../src/app.js";
import type { ApiConfig } from "../src/config.js";

const unusedDatabase = (() => { throw new Error("database should not be reached"); }) as unknown as Database;
const config = { host: "127.0.0.1", port: 8787, allowedOrigin: "http://127.0.0.1:5173", databaseUrl: "postgres://unused", sessionSecret: "x".repeat(43), mode: "ci", aiConfigured: false, urlFetchEnabled: false, priceProfileVersion: null, generationReservationCnyMicros: 0 } satisfies ApiConfig;

describe("HTTP contract", () => {
  it("publishes OpenAPI 3.1 with unique operation ids", async () => {
    const response = await createApp(unusedDatabase, config).request("http://127.0.0.1:8787/openapi.json"); const document = await response.json() as { openapi: string; paths: Record<string, Record<string, { operationId?: string }>> };
    expect(document.openapi).toBe("3.1.0"); const ids = Object.values(document.paths).flatMap((path) => Object.values(path).map((operation) => operation.operationId).filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
    for(const path of ["/api/v1/runtime","/api/v1/tasks","/api/v1/tasks/{taskId}","/api/v1/tasks/{taskId}/copies","/api/v1/tasks/{taskId}/context","/api/v1/tasks/{taskId}/question-set","/api/v1/tasks/{taskId}/sources","/api/v1/tasks/{taskId}/materials","/api/v1/tasks/{taskId}/source-selection","/api/v1/tasks/{taskId}/evidence-map","/api/v1/tasks/{taskId}/lesson-design","/api/v1/tasks/{taskId}/rubric","/api/v1/tasks/{taskId}/proposals","/api/v1/tasks/{taskId}/proposals/{revisionId}","/api/v1/tasks/{taskId}/proposals/{revisionId}/adoption","/api/v1/tasks/{taskId}/audits","/api/v1/tasks/{taskId}/audits/{runId}","/api/v1/tasks/{taskId}/decisions","/api/v1/tasks/{taskId}/exports","/api/v1/tasks/{taskId}/exports/{exportId}/manifest","/api/v1/tasks/{taskId}/restorations","/api/v1/tasks/{taskId}/operations/{operationId}","/api/v1/tasks/{taskId}/events"])expect(document.paths[path],path).toBeDefined();
  });
  it("uses the same safe problem for a missing session", async () => {
    const response = await createApp(unusedDatabase, config).request(`http://127.0.0.1:8787/api/v1/tasks/${crypto.randomUUID()}`); const body = await response.json();
    expect(response.status).toBe(401); expect(body).toMatchObject({ code: "SESSION_REQUIRED" }); expect(JSON.stringify(body)).not.toContain("workspace");
  });
});
