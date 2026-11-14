import { describe, expect, it } from "vitest";
import {
  EnvKeyResolver,
  NONCE_TTL_SECONDS,
  computeSignature,
  signaturesMatch,
  verifyHmacRequest,
  type NonceStore,
} from "../packages/security/src/index.js";

const SECRET = "s".repeat(40);
const OLD_SECRET = "o".repeat(40);
const KEY_ID = "game-main";
const NOW = 1_800_000_000;

class MemoryNonceStore implements NonceStore {
  readonly seen = new Set<string>();
  ttl = 0;
  async claim(keyId: string, nonce: string, ttlSeconds: number): Promise<boolean> {
    this.ttl = ttlSeconds;
    const k = `${keyId}:${nonce}`;
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
}

function signed(opts: { secret?: string; ts?: number; nonce?: string; body?: string; keyId?: string } = {}) {
  const ts = String(opts.ts ?? NOW);
  const nonce = opts.nonce ?? "n".repeat(24);
  const body = Buffer.from(opts.body ?? '{"a":1}');
  const sig = computeSignature(opts.secret ?? SECRET, ts, nonce, body);
  return {
    rawBody: body,
    headers: {
      "x-forge-timestamp": ts,
      "x-forge-nonce": nonce,
      "x-forge-signature": sig,
      "x-forge-key-id": opts.keyId ?? KEY_ID,
    },
  };
}

const keys = new EnvKeyResolver(KEY_ID, SECRET, OLD_SECRET);

async function run(req: ReturnType<typeof signed>, nonces = new MemoryNonceStore(), now = NOW) {
  return verifyHmacRequest({ ...req, nowSeconds: now, keys, nonces });
}

describe("computeSignature", () => {
  it("é determinística e depende de cada componente", () => {
    const base = computeSignature(SECRET, "1", "abc", "body");
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSignature(SECRET, "1", "abc", "body")).toBe(base);
    expect(computeSignature(SECRET, "2", "abc", "body")).not.toBe(base);
    expect(computeSignature(SECRET, "1", "abd", "body")).not.toBe(base);
    expect(computeSignature(SECRET, "1", "abc", "bodz")).not.toBe(base);
    expect(computeSignature("x".repeat(40), "1", "abc", "body")).not.toBe(base);
  });

  it("separador '.' evita ambiguidade entre campos", () => {
    expect(computeSignature(SECRET, "1", "2", "3")).not.toBe(computeSignature(SECRET, "1.2", "", "3"));
  });
});

describe("signaturesMatch", () => {
  it("rejeita formatos inválidos sem lançar exceção", () => {
    const good = computeSignature(SECRET, "1", "n", "b");
    expect(signaturesMatch(good, good)).toBe(true);
    expect(signaturesMatch(good, "zz")).toBe(false);
    expect(signaturesMatch(good, good.slice(0, 62))).toBe(false);
    expect(signaturesMatch(good, "g".repeat(64))).toBe(false);
  });
});

describe("verifyHmacRequest", () => {
  it("aceita requisição válida e registra nonce com TTL > 2x a tolerância", async () => {
    const store = new MemoryNonceStore();
    const r = await run(signed(), store);
    expect(r).toEqual({ ok: true, keyId: KEY_ID });
    expect(store.ttl).toBe(NONCE_TTL_SECONDS);
    expect(NONCE_TTL_SECONDS).toBeGreaterThan(60);
  });

  it("rejeita replay do mesmo nonce", async () => {
    const store = new MemoryNonceStore();
    const req = signed();
    expect((await run(req, store)).ok).toBe(true);
    expect(await run(req, store)).toEqual({ ok: false, reason: "replay" });
  });

  it("não consome nonce quando a assinatura é inválida", async () => {
    const store = new MemoryNonceStore();
    const r = await run(signed({ secret: "x".repeat(40) }), store);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
    expect(store.seen.size).toBe(0);
  });

  it("rejeita corpo adulterado", async () => {
    const req = signed();
    expect(await run({ ...req, rawBody: Buffer.from('{"a":2}') })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("aplica janela de 30 s nos dois sentidos (borda inclusiva)", async () => {
    expect((await run(signed({ ts: NOW - 30 }))).ok).toBe(true);
    expect((await run(signed({ ts: NOW + 30, nonce: "m".repeat(24) }))).ok).toBe(true);
    expect(await run(signed({ ts: NOW - 31 }))).toEqual({ ok: false, reason: "timestamp_out_of_window" });
    expect(await run(signed({ ts: NOW + 31 }))).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("rejeita headers ausentes, timestamp e nonce malformados", async () => {
    const ok = signed();
    const { "x-forge-signature": _omit, ...rest } = ok.headers;
    expect(await run({ ...ok, headers: rest as typeof ok.headers })).toEqual({ ok: false, reason: "missing_headers" });
    expect(await run(signed({ ts: 0 }).headers["x-forge-timestamp"] === "0" ? { ...ok, headers: { ...ok.headers, "x-forge-timestamp": "1e9" } } : ok)).toEqual({
      ok: false,
      reason: "bad_timestamp",
    });
    expect(await run(signed({ nonce: "curto" }))).toEqual({ ok: false, reason: "bad_nonce" });
  });

  it("rejeita key id desconhecido", async () => {
    expect(await run(signed({ keyId: "outro" }))).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("aceita o segredo anterior durante a rotação", async () => {
    expect((await run(signed({ secret: OLD_SECRET }))).ok).toBe(true);
  });

  it("isola nonces por key id", async () => {
    const store = new MemoryNonceStore();
    await store.claim("outra-chave", "n".repeat(24), 65);
    expect((await run(signed(), store)).ok).toBe(true);
  });
});
