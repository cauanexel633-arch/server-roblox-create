import { randomUUID } from "node:crypto";

export type WorkerBatchResult = {
  acquired: boolean;
  processed: number;
  exhausted: boolean;
};

export type WorkerBatchDependencies = {
  acquire(workerToken: string, leaseSeconds: number, maxSlots: number): Promise<boolean>;
  release(workerToken: string): Promise<unknown>;
  processOne(): Promise<boolean>;
  now?: () => number;
  createToken?: () => string;
};

export type WorkerBatchOptions = {
  maxConcurrentJobs: number;
  maxJobs?: number;
  leaseSeconds?: number;
  budgetMs?: number;
};

export async function runWorkerBatch(
  dependencies: WorkerBatchDependencies,
  options: WorkerBatchOptions
): Promise<WorkerBatchResult> {
  const maxConcurrentJobs = Math.max(1, Math.min(10, Math.floor(options.maxConcurrentJobs)));
  const maxJobs = Math.max(1, Math.min(50, Math.floor(options.maxJobs ?? 10)));
  const leaseSeconds = Math.max(30, Math.min(300, Math.floor(options.leaseSeconds ?? 120)));
  const budgetMs = Math.max(1_000, Math.min(54_000, Math.floor(options.budgetMs ?? 50_000)));
  const now = dependencies.now ?? Date.now;
  const workerToken = (dependencies.createToken ?? randomUUID)();
  const acquired = await dependencies.acquire(workerToken, leaseSeconds, maxConcurrentJobs);
  if (!acquired) return { acquired: false, processed: 0, exhausted: false };

  const startedAt = now();
  let processed = 0;
  let exhausted = false;
  try {
    while (processed < maxJobs && now() - startedAt < budgetMs) {
      const didProcess = await dependencies.processOne();
      if (!didProcess) break;
      processed += 1;
    }
    exhausted = processed >= maxJobs || now() - startedAt >= budgetMs;
    return { acquired: true, processed, exhausted };
  } finally {
    await dependencies.release(workerToken);
  }
}
