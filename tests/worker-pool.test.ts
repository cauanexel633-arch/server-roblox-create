import { describe, expect, it, vi } from "vitest";
import { runWorkerBatch } from "../src/worker-pool.js";

describe("runWorkerBatch", () => {
  it("does not claim or process queue messages when no global slot is available", async () => {
    const processOne = vi.fn(async () => true);
    const release = vi.fn(async () => undefined);
    const result = await runWorkerBatch({
      acquire: async () => false,
      release,
      processOne,
      maxConcurrentJobs: 3
    });

    expect(result).toEqual({ acquired: false, processed: 0, exhausted: false });
    expect(processOne).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("drains messages sequentially until the queue is empty and releases its lease", async () => {
    const processOne = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const acquire = vi.fn(async () => true);
    const release = vi.fn(async () => undefined);

    const result = await runWorkerBatch({
      acquire,
      release,
      processOne,
      maxConcurrentJobs: 3,
      maxJobs: 8
    });

    expect(acquire).toHaveBeenCalledWith(expect.any(String), 120, 3);
    expect(processOne).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ acquired: true, processed: 2, exhausted: false });
    expect(release).toHaveBeenCalledWith(expect.any(String));
  });

  it("releases the worker lease even when processing throws", async () => {
    const release = vi.fn(async () => undefined);
    await expect(runWorkerBatch({
      acquire: async () => true,
      release,
      processOne: async () => { throw new Error("processing failure"); },
      maxConcurrentJobs: 3
    })).rejects.toThrow("processing failure");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("stops after its per-invocation job limit", async () => {
    const processOne = vi.fn(async () => true);
    const result = await runWorkerBatch({
      acquire: async () => true,
      release: async () => undefined,
      processOne,
      maxConcurrentJobs: 3,
      maxJobs: 2
    });
    expect(processOne).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ acquired: true, processed: 2, exhausted: true });
  });
});
