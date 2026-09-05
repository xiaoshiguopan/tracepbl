import type { JobRow } from "@tracepbl/repositories";

export interface WorkerJobs {
  claim(workerId: string, leaseSeconds?: number): Promise<JobRow | null>;
  finish(jobId: string, leaseToken: string, status: "succeeded" | "failed" | "cancelled" | "stale", errorCode?: string): Promise<boolean>;
  releaseForRetry(jobId: string, leaseToken: string, delaySeconds: number, errorCode: string): Promise<boolean>;
  renew(jobId: string, leaseToken: string, leaseSeconds?: number): Promise<boolean>;
  cancellationRequested(jobId: string, leaseToken: string): Promise<boolean>;
}
export type JobHandler = (job: JobRow, signal: AbortSignal) => Promise<void | "managed">;
export class WorkerFailure extends Error { constructor(public readonly code: string, public readonly retryable = false) { super(code); } }

export class WorkerRunner {
  constructor(private readonly jobs: WorkerJobs, private readonly workerId: string, private readonly handlers: Readonly<Record<string, JobHandler>>) {}
  async runOnce() {
    const job = await this.jobs.claim(this.workerId); if (!job) return false;
    if (!job.leaseToken) throw new Error("claimed job has no lease token");
    const handler = this.handlers[job.jobKind];
    if (!handler) { await this.jobs.finish(job.id, job.leaseToken, "failed", "UNSUPPORTED_JOB_KIND"); return true; }
    const controller = new AbortController();
    const heartbeat = setInterval(async () => { try { if (await this.jobs.cancellationRequested(job.id, job.leaseToken!)) controller.abort(new WorkerFailure("CANCELLED")); else if (!(await this.jobs.renew(job.id, job.leaseToken!))) controller.abort(new WorkerFailure("LEASE_LOST")); } catch { controller.abort(new WorkerFailure("LEASE_LOST")); } }, 10_000); heartbeat.unref();
    try { const outcome = await handler(job, controller.signal); if (outcome === "managed") return true; if (await this.jobs.cancellationRequested(job.id, job.leaseToken)) controller.abort(new WorkerFailure("CANCELLED")); if (controller.signal.aborted) await this.jobs.finish(job.id, job.leaseToken, "cancelled", "CANCELLED"); else await this.jobs.finish(job.id, job.leaseToken, "succeeded"); }
    catch (error) {
      const coded=error as {code?:unknown;retryable?:unknown;message?:unknown};
      const databaseFailure = coded?.code === "P0001" && typeof coded.message === "string" && ["BUDGET_EXCEEDED","PRICE_PROFILE_INVALID","PROVIDER_RESULT_UNKNOWN","LEASE_LOST","RESULT_STALE","PROVIDER_OUTPUT_INVALID"].includes(coded.message) ? coded.message : null;
      const failure = error instanceof WorkerFailure ? error : databaseFailure ? new WorkerFailure(databaseFailure) : typeof coded?.code==="string"?new WorkerFailure(coded.code,coded.retryable===true):new WorkerFailure("WORKER_FAILED");
      if (failure.code === "RESULT_STALE") await this.jobs.finish(job.id,job.leaseToken,"stale",failure.code);
      else if (failure.code === "CANCELLED") await this.jobs.finish(job.id, job.leaseToken, "cancelled", failure.code);
      else { const delays = [2, 10, 30]; const delay = delays[Math.min(job.attempts - 1, delays.length - 1)] ?? 30; if (!failure.retryable || !(await this.jobs.releaseForRetry(job.id, job.leaseToken, delay, failure.code))) await this.jobs.finish(job.id, job.leaseToken, "failed", failure.code); }
    } finally { clearInterval(heartbeat); }
    return true;
  }
}
