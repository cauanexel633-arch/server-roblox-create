# Forge3D Parallel Workers and OpenRouter Fallback — Design

**Date:** 2026-11-14  
**Status:** Awaiting user approval

## Intent

Increase Forge3D's weapon-generation throughput so many Roblox players can submit requests without having every request wait for one global worker. Requests remain durably queued in Supabase and are processed by a bounded pool of workers.

## Goals

- Process up to **3 jobs concurrently by default**, configurable without code changes.
- Keep every accepted request in the existing Supabase PGMQ queue.
- Let separate workers claim distinct jobs safely; prevent duplicate processing and enforce a global concurrency ceiling across Vercel instances.
- Preserve each job's existing retry, Roblox publication polling, artifact storage, and player/job association.
- Improve OpenRouter resilience: select eligible free text models, rotate the first choice, and try multiple alternatives when a model errors, times out, or returns empty content.
- Drain queued work without relying solely on the five-minute cron when several requests arrive together.
- Expose useful logs for active workers, selected model, fallback attempts, and queue outcomes without logging credentials or private prompts.

## Non-goals

- Strict completion order: parallel jobs can finish in a different order from submission. Queue claims should still favor arrival order where PGMQ permits.
- Charging for paid models or introducing another AI provider.
- Changing Roblox RemoteEvents or requiring a replacement LocalScript.
- Replacing the current procedural sword geometry. The AI currently produces a specification while mesh generation still uses the existing sword routine; richer geometry generation is a separate feature.

## Current state and constraints found

- `src/jobs.ts` calls `forge_claim_jobs(p_qty: 1, p_visibility_seconds: 90)`; each invocation handles one message.
- `forge_claim_jobs` delegates to `pgmq.read('forge_jobs', ...)`, so multiple independent invocations can already claim different messages, but there is no global concurrency ceiling.
- Roblox publication that is still pending is requeued after 20 seconds, and the current invocation returns.
- Immediate Roblox triggers may overlap. If excess triggers simply return while all workers are busy, queued jobs must still be picked up after active workers finish.
- `src/openrouter.ts` currently filters the catalog to `:free` models but attempts only the first two and accepts only non-empty string content.
- Vercel's function maximum duration is 60 seconds. Queue message visibility is currently 90 seconds.

## Approaches considered

1. **Unbounded parallel invocation:** lowest implementation effort, but can overload OpenRouter/Roblox, exceed provider rate limits, and create unpredictable resource usage. Rejected.
2. **Bounded worker pool backed by Supabase leases:** a fixed number of database-controlled worker slots coordinates all Vercel instances. Each worker drains available messages while within its execution budget; expired leases recover from crashed invocations. This is the selected approach because the concurrency cap is global and survives serverless instance boundaries.
3. **Central dispatcher service:** a separate long-running service distributes jobs. More control, but adds infrastructure and operating cost not justified for this project.

## Selected behavior

### Queue and concurrency

- Add a small private worker-slot table with **3 slots by default** and a configurable maximum (initial environment setting: `MAX_CONCURRENT_JOBS=3`). Database RPCs atomically acquire, renew, and release a slot using row locking / `SKIP LOCKED`; each lease has a unique worker token and an expiry.
- A worker must acquire a slot **before** claiming a PGMQ message. If no slot is available, the trigger returns a normal busy/accepted response rather than a 500.
- Each active worker processes one job at a time, then checks for the next available message until the queue is empty or its safe execution deadline is reached. This allows a burst of requests to be drained by the active pool rather than leaving the remainder until cron.
- Use a lease longer than the Vercel execution ceiling (initially 120 seconds) and retain PGMQ visibility long enough to avoid concurrent reclaims. Release the lease in `finally`; a crashed worker is recovered when its lease expires.
- Keep existing delayed retry behavior for transient failures and pending Roblox publication. A pending publication returns its message to the queue and allows another job to proceed; strict FIFO completion is not promised.
- When a worker exits, it checks for remaining ready messages after releasing its slot and attempts to dispatch again, closing the race where a new enqueue arrives while all slots are occupied. Existing cron remains a recovery safety net.
- Keep the existing idempotency key behavior so duplicate client submissions do not create duplicate jobs.

### OpenRouter model selection and fallback

- Keep the OpenRouter model catalog cache, but filter to free models with text-capable modality and valid IDs.
- Rotate the starting model across the eligible catalog rather than always selecting the same first entries.
- Attempt up to **4 eligible models** per agent call, with bounded per-model timeouts and one overall budget that remains compatible with the 60-second Vercel function limit.
- Continue to another model for empty content, timeout, rate limiting, or provider 5xx errors. Fail fast for permanent configuration/authentication errors rather than wasting the whole budget.
- Record model IDs and sanitized failure categories in logs. Never log API keys or full user prompts.
- If all candidates fail, preserve the existing job retry/dead-letter behavior so requests are not silently discarded.

## Configuration defaults

- `MAX_CONCURRENT_JOBS=3` — global number of active jobs.
- OpenRouter fallback attempts: 4.
- OpenRouter overall budget remains bounded and must leave enough time for Roblox upload/polling and database finalization within Vercel's 60-second ceiling.
- Lease expiry: 120 seconds initially; PGMQ visibility must be configured consistently and renewed if processing can exceed its safe window.

## Files and database areas expected to change

- `src/config.ts`: validate the concurrency configuration.
- `src/jobs.ts`: worker-slot lifecycle, bounded queue-drain loop, and safe continuation behavior.
- `src/openrouter.ts`: eligible model filtering, rotation, and bounded fallback policy.
- `src/index.ts` / internal process-queue route: return a normal busy result and coordinate queue draining.
- Supabase migration SQL: worker-slot table and narrowly scoped RPCs for acquire/renew/release/dispatch coordination; do not expose worker coordination to public client roles.
- Tests: queue concurrency/lease recovery and OpenRouter fallback behavior.

## Failure handling and security

- Worker-slot RPCs must be atomic and callable only by the backend service role.
- A worker may release only the slot held with its own token.
- A lease must expire automatically after a crashed Vercel invocation.
- Never claim a job before obtaining a worker slot.
- Keep queue message visibility and worker lease timings consistent to avoid duplicate execution.
- Preserve job-level idempotency and existing status transitions.
- Do not expose Supabase service-role credentials, OpenRouter keys, Roblox tokens, or worker tokens to Roblox clients.

## Acceptance criteria

1. With three slots, no more than three jobs are in active processing globally, even when multiple Vercel instances receive simultaneous triggers.
2. A fourth or later request remains queued and is eventually processed without requiring a new player submission.
3. Two workers never process the same queue message concurrently.
4. An expired worker lease can be reclaimed after a simulated crash.
5. Pending Roblox publication and transient job failures remain retryable without losing the job.
6. An empty response or transient failure from one OpenRouter model causes another eligible model to be tried.
7. Permanent OpenRouter authentication/configuration errors fail promptly.
8. Tests and TypeScript build pass; production deployment and a controlled queue test are verified before calling the change complete.
