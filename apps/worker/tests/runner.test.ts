import { describe, expect, it, vi } from "vitest";
import type { JobRow } from "@tracepbl/repositories";
import { WorkerFailure, WorkerRunner, type WorkerJobs } from "../src/runner.js";

const job: JobRow = { id: crypto.randomUUID(), workspaceId: crypto.randomUUID(), taskId: crypto.randomUUID(), modelRunId: crypto.randomUUID(), jobKind: "model", status: "running", attempts: 1, maxAttempts: 2, leaseToken: crypto.randomUUID(), waitState: null, progressCurrent: 0, progressTotal: null, cancelRequestedAt: null, payload: {}, startedAt: new Date(), updatedAt: new Date(), errorCode: null };
function jobs(overrides: Partial<WorkerJobs> = {}): WorkerJobs { return { claim: vi.fn(async () => job), finish: vi.fn(async () => true), releaseForRetry: vi.fn(async () => true), renew: vi.fn(async () => true), cancellationRequested: vi.fn(async () => false), ...overrides }; }
describe("worker lease outcomes", () => {
  it("preserves safe database budget failure codes without retrying unknown usage", async () => {
    const repository = jobs();
    await new WorkerRunner(repository,"worker",{model:async()=>{throw Object.assign(new Error("PROVIDER_RESULT_UNKNOWN"),{code:"P0001"});}}).runOnce();
    expect(repository.finish).toHaveBeenCalledWith(job.id,job.leaseToken,"failed","PROVIDER_RESULT_UNKNOWN");
    expect(repository.releaseForRetry).not.toHaveBeenCalled();
  });
  it("finishes only through the lease-aware repository", async () => { const repository = jobs(); await new WorkerRunner(repository, "worker", { model: async () => undefined }).runOnce(); expect(repository.finish).toHaveBeenCalledWith(job.id, job.leaseToken, "succeeded"); });
  it("requeues only explicitly retryable failures", async () => { const repository = jobs(); await new WorkerRunner(repository, "worker", { model: async () => { throw new WorkerFailure("TRANSIENT", true); } }).runOnce(); expect(repository.releaseForRetry).toHaveBeenCalledWith(job.id, job.leaseToken, 2, "TRANSIENT"); });
  it("does not retry unknown-result failures", async () => { const repository = jobs(); await new WorkerRunner(repository, "worker", { model: async () => { throw new WorkerFailure("PROVIDER_TIMEOUT_UNKNOWN", false); } }).runOnce(); expect(repository.finish).toHaveBeenCalledWith(job.id, job.leaseToken, "failed", "PROVIDER_TIMEOUT_UNKNOWN"); });
  it("records stale work as a fenced terminal outcome",async()=>{const repository=jobs();await new WorkerRunner(repository,"worker",{model:async()=>{throw new WorkerFailure("RESULT_STALE");}}).runOnce();expect(repository.finish).toHaveBeenCalledWith(job.id,job.leaseToken,"stale","RESULT_STALE");});
});
