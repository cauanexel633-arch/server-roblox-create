import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type AppDeps } from "../apps/api/index.js";
import { EnvKeyResolver, computeSignature, type NonceStore } from "../packages/security/src/index.js";
import { loadConfig, ulid } from "../packages/shared/src/index.js";
import type { GenerateResponse } from "../packages/schemas/src/index.js";

const SECRET = "s".repeat(40);
const CRON = "c".repeat(40);
const KEY_ID = "game-main";
const NOW = 1_800_000_000;

const configResult = loadConfig({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30),
  FORGE_HMAC_KEY_ID: KEY_ID,
  FORGE_HMAC_SECRET: SECRET,
  CRON_SECRET: CRON,
  LOG_LEVEL: "silent",
});

class MemoryNonceStore implements NonceStore {
  private readonly seen = new Set<string>();
  async claim(keyId: string, nonce: string): Promise<boolean> {
    const k = `${keyId}:${nonce}`;
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
}

const body = {
  player: { user_id: 42, username: "Player" },
  weapon_description: "Espada de plasma com cabo de obsidiana",
  category: "melee.sword",
  style: "sci-fi.cyberpunk",
  idempotency_key: "7b0f3d5e-6c1a-4f3e-9d2b-1a2b3c4d5e6f",
};

function sign(raw: string, nonce = ulid() + "abc") {
  const ts = String(NOW);
  return {
    "content-type": "application/json",
    "x-forge-key-id": KEY_ID,
    "x-forge-timestamp": ts,
    "x-forge-nonce": nonce,
    "x-forge-signature": computeSignature(SECRET, ts, nonce, raw),
  };
}

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

function make(extra: Partial<AppDeps> = {}): FastifyInstance {
  app = buildApp({
    configResult,
    keyResolver: new EnvKeyResolver(KEY_ID, SECRET),
    nonceStore: new MemoryNonceStore(),
    nowSeconds: () => NOW,
    ...extra,
  });
  return app;
}

const okJob = {
  async createJob(): Promise<GenerateResponse> {
    const id = ulid();
    return { job_id: id, status: "queued", progress: 0, status_url: `/v1/jobs/${id}`, stream_url: `/v1/jobs/${id}/stream` };
  },
};

describe("GET /health e /ready", () => {
  it("/health responde 200 com trace id", async () => {
    const res = await make().inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-trace-id"]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("/ready retorna 503 listando o que falta, sem vazar valores", async () => {
    const res = await make().inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toMatchObject({ config: true, job_gateway: false, queue_processor: false });
    expect(res.body).not.toContain(SECRET);
  });

  it("/ready informa variáveis ausentes por nome", async () => {
    app = buildApp({ configResult: loadConfig({ LOG_LEVEL: "silent" }) });
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().missing_env).toContain("CRON_SECRET");
  });

  it("/ready retorna 200 quando tudo está ligado", async () => {
    const res = await make({
      jobs: okJob,
      queue: { async processBatch() { return { processed: 0 }; } },
    }).inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /v1/generate", () => {
  it("202 com requisição assinada e válida", async () => {
    const raw = JSON.stringify(body);
    const res = await make({ jobs: okJob }).inject({ method: "POST", url: "/v1/generate", headers: sign(raw), payload: raw });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("queued");
  });

  it("401 sem assinatura, com mensagem genérica", async () => {
    const res = await make({ jobs: okJob }).inject({
      method: "POST",
      url: "/v1/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json().detail).toBeUndefined();
  });

  it("401 em replay do mesmo nonce", async () => {
    const raw = JSON.stringify(body);
    const headers = sign(raw, "r".repeat(24));
    const a = make({ jobs: okJob });
    expect((await a.inject({ method: "POST", url: "/v1/generate", headers, payload: raw })).statusCode).toBe(202);
    expect((await a.inject({ method: "POST", url: "/v1/generate", headers, payload: raw })).statusCode).toBe(401);
  });

  it("401 quando o corpo é alterado após assinar", async () => {
    const raw = JSON.stringify(body);
    const res = await make({ jobs: okJob }).inject({
      method: "POST",
      url: "/v1/generate",
      headers: sign(raw),
      payload: JSON.stringify({ ...body, weapon_description: "outra coisa" }),
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 para corpo assinado porém inválido", async () => {
    const raw = JSON.stringify({ ...body, category: "sword" });
    const res = await make({ jobs: okJob }).inject({ method: "POST", url: "/v1/generate", headers: sign(raw), payload: raw });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("validation_error");
  });

  it("400 para JSON malformado", async () => {
    const raw = "{nao-json";
    const res = await make({ jobs: okJob }).inject({ method: "POST", url: "/v1/generate", headers: sign(raw), payload: raw });
    expect(res.statusCode).toBe(400);
  });

  it("503 fail-closed sem NonceStore", async () => {
    const raw = JSON.stringify(body);
    app = buildApp({ configResult, keyResolver: new EnvKeyResolver(KEY_ID, SECRET), nowSeconds: () => NOW });
    const res = await app.inject({ method: "POST", url: "/v1/generate", headers: sign(raw), payload: raw });
    expect(res.statusCode).toBe(503);
  });

  it("503 honesto quando persistência/fila ainda não estão ligadas", async () => {
    const raw = JSON.stringify(body);
    const res = await make().inject({ method: "POST", url: "/v1/generate", headers: sign(raw), payload: raw });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("not_ready");
  });
});

describe("/api/internal/process-queue", () => {
  const queue = { async processBatch() { return { processed: 3 }; } };

  it("401 sem Bearer correto", async () => {
    const a = make({ queue });
    expect((await a.inject({ method: "GET", url: "/api/internal/process-queue" })).statusCode).toBe(401);
    expect((await a.inject({ method: "GET", url: "/api/internal/process-queue", headers: { authorization: "Bearer errado" } })).statusCode).toBe(401);
  });

  it("200 via GET (Vercel Cron) e POST com CRON_SECRET correto", async () => {
    const a = make({ queue });
    const headers = { authorization: `Bearer ${CRON}` };
    const get = await a.inject({ method: "GET", url: "/api/internal/process-queue", headers });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ processed: 3 });
    expect((await a.inject({ method: "POST", url: "/api/internal/process-queue", headers })).statusCode).toBe(200);
  });

  it("503 autenticado enquanto o processador não existe", async () => {
    const res = await make().inject({ method: "GET", url: "/api/internal/process-queue", headers: { authorization: `Bearer ${CRON}` } });
    expect(res.statusCode).toBe(503);
  });
});
