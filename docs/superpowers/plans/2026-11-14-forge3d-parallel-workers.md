# Forge3D Parallel Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Process queued Forge3D weapon requests with a globally bounded pool of three concurrent workers and resilient OpenRouter model fallback.

**Architecture:** Supabase owns atomic worker-slot leases so the concurrency limit applies across serverless Vercel instances. Each leased worker drains distinct PGMQ messages until the queue is empty or its execution budget is nearly exhausted. OpenRouter uses eligible free text models with rotating selection and bounded fallback.

**Tech Stack:** TypeScript, Fastify, Supabase Postgres + PGMQ, OpenRouter-compatible Chat Completions API, Vitest, Vercel Node.js 22.

**Spec:** docs/superpowers/specs/2026-11-14-forge3d-parallel-workers-design.md

## Global Constraints

- Default global concurrency is MAX_CONCURRENT_JOBS=3.
- OpenRouter attempts up to 4 eligible free text models per agent call.
- Vercel function maximum duration is 60 seconds.
- Never claim a PGMQ message before acquiring a worker slot.
- Preserve existing idempotency, job retry, Roblox publication polling, artifact storage, and RemoteEvent contracts.
- Worker lease expiry starts at 120 seconds; PGMQ visibility must exceed expected execution time and be renewed if needed.
- Worker coordination RPCs are service-role-only.
- Do not expose secrets or log full user prompts.

## Review Focus

- Worker crashes after claiming a slot or queue message: lease expiry and message visibility must permit safe recovery.
- A worker exits while a new request is enqueued: continuation attempt or cron must eventually drain it.
- Roblox publication remains pending: the same job must resume polling without regenerating the agent spec.
- OpenRouter returns non-string/empty content: try another eligible model.
- OpenRouter returns permanent auth/configuration errors: fail promptly rather than cycling through candidates.

---

### Task 1: Supabase worker-slot leases

**Files:**
- Create: supabase/migrations/<timestamp>_forge_worker_slots.sql
- Test: SQL validation queries documented alongside migration or migration tests, following repository convention.

**Interfaces:**
- Produces: service-role RPCs forge_acquire_worker(p_worker_token uuid, p_lease_seconds integer), forge_renew_worker(p_worker_token uuid, p_lease_seconds integer), and forge_release_worker(p_worker_token uuid).
- Slot table stores a stable slot ID, worker token, lease expiry, and updated timestamp; seed exactly three slots by default.
- Acquire is atomic and returns whether a slot was acquired; only an expired/free slot may be claimed.
- Renew/release must match the caller's token. Releasing a stale token must not clear another worker's lease.

- [ ] Write SQL assertions for three initial slots, no fourth lease, expired lease reclaim, and stale-token release rejection.
- [ ] Apply migration in a local/test database or validate SQL safely before applying to the connected Supabase project.
- [ ] Verify RPC execute grants are limited to service_role and verify acquire/renew/release behavior with concurrent SQL sessions if available.

### Task 2: OpenRouter fallback and rotation

**Files:**
- Modify: src/openrouter.ts
- Create: src/openrouter.test.ts (or extend the existing OpenRouter test file if present).

**Interfaces:**
- Preserve freeModels(signal?: AbortSignal): Promise<Model[]>.
- Preserve completeAgent(systemPrompt: string, input: unknown): Promise<string>.
- Eligible models must have IDs ending in :free and text-capable architecture modality.
- Try at most 4 eligible models per call, rotating the starting candidate between calls.
- Overall timeout must remain bounded below the Vercel function deadline, leaving time for job finalization.

- [ ] Add tests for modality filtering, empty-content fallback, transient-error fallback, permanent-auth fail-fast, and rotating starting index.
- [ ] Run focused tests and confirm failure before implementation.
- [ ] Implement candidate filtering, in-process round-robin start selection, and bounded fallback; preserve sanitized error reporting.
- [ ] Run focused tests and TypeScript typecheck.

### Task 3: Worker pool integration and queue draining

**Files:**
- Modify: src/config.ts
- Modify: src/jobs.ts
- Modify: internal queue route in src/index.ts (confirm exact route during implementation).
- Create or extend: worker/job tests following repository conventions.

**Interfaces:**
- Add MAX_CONCURRENT_JOBS integer config, default 3, bounded to a safe range (1–10).
- Add a worker runner that acquires a slot before calling forge_claim_jobs, uses a unique UUID token, and releases its slot in finally.
- Each worker processes messages one at a time until no message remains or a safe execution deadline is reached.
- Use a lease of 120 seconds and a PGMQ visibility timeout consistent with the maximum invocation time; renew lease before expiry if processing may exceed it.
- A busy trigger returns a successful non-error response and leaves all jobs queued.
- After a worker releases its slot, attempt safe continuation if ready messages remain; retain cron as a recovery path.
- Do not recursively invoke public unauthenticated routes or expose internal worker tokens.

- [ ] Add tests proving a worker does not claim without a slot, caps active workers globally through the RPC contract, drains multiple jobs sequentially per slot, releases on success/error, and returns busy without 500.
- [ ] Add tests for continuation after slot release and for pending Roblox publication preserving existing operation path/spec.
- [ ] Implement config and worker lifecycle with try/finally, bounded loop deadline, lease renewal, and safe continuation.
- [ ] Run all tests and typecheck; inspect all queue status transitions.

### Task 4: Production migration, deployment, and verification

**Files:**
- Modify: deployment configuration only if required by verified implementation.
- Update: this plan/spec with migration and operational notes if needed.

- [ ] Apply the migration to Supabase after reviewing the exact SQL and confirming no destructive operations.
- [ ] Configure MAX_CONCURRENT_JOBS=3 in Vercel Production, Preview, and Development as appropriate.
- [ ] Open a PR from the implementation branch to main.
- [ ] Verify CI/build and review the diff for security, queue correctness, and regression risk.
- [ ] Merge only after checks pass; verify the production deployment reaches READY.
- [ ] Run a controlled burst test with at least 5 jobs and confirm no more than 3 active jobs, no duplicate claims, and eventual completion/retry of every accepted job.

## Implementation notes

- PGMQ forge_claim_jobs currently calls pgmq.read('forge_jobs', p_visibility_seconds, p_qty); this provides distinct message claims but does not enforce a global worker ceiling.
- forge_retry_job currently calls pgmq.set_vt, so pending Roblox operations and transient failures are delayed messages; parallel processing intentionally does not guarantee completion order.
- Current mesh generation uses createSwordMesh regardless of the AI specification. This plan does not change that separate geometry-generation limitation.
