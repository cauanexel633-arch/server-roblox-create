import { describe, expect, it } from "vitest";
import { GenerateRequestSchema, QueueMessageSchema, STAGES } from "../packages/schemas/src/index.js";
import { ULID_REGEX, loadConfig, ulid } from "../packages/shared/src/index.js";

const valid = {
  player: { user_id: 123456789, username: "Player" },
  weapon_description: "Espada de plasma com cabo de obsidiana e núcleo energético pulsante",
  category: "melee.sword",
  style: "sci-fi.cyberpunk",
  preset_prompt_id: "roblox.default.v3",
  constraints: { max_tris: 18000, rarity: "legendary", level: 42, quality: "ultra" },
  idempotency_key: "7b0f3d5e-6c1a-4f3e-9d2b-1a2b3c4d5e6f",
};

describe("GenerateRequestSchema", () => {
  it("aceita o exemplo do documento mestre", () => {
    expect(GenerateRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("aplica quality=high quando constraints é omitido", () => {
    const { constraints: _c, ...rest } = valid;
    const r = GenerateRequestSchema.parse(rest);
    expect(r.constraints.quality).toBe("high");
  });

  it("remove caracteres de controle da descrição", () => {
    const r = GenerateRequestSchema.parse({ ...valid, weapon_description: "  espada\u0000\u0007 laser  " });
    expect(r.weapon_description).toBe("espada laser");
  });

  it.each([
    ["category sem ponto", { category: "sword" }],
    ["category com maiúsculas", { category: "Melee.Sword" }],
    ["idempotency_key inválida", { idempotency_key: "abc" }],
    ["descrição curta", { weapon_description: "ab" }],
    ["descrição longa", { weapon_description: "x".repeat(1001) }],
    ["user_id negativo", { player: { user_id: -1, username: "a" } }],
    ["max_tris absurdo", { constraints: { max_tris: 10_000_000 } }],
    ["raridade desconhecida", { constraints: { rarity: "ultra-rare" } }],
  ])("rejeita %s", (_n, patch) => {
    expect(GenerateRequestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("QueueMessageSchema", () => {
  it("valida mensagem com handles e rejeita estágio desconhecido", () => {
    const base = {
      job_id: ulid(),
      stage_id: STAGES[0],
      trace_id: ulid(),
      attempt: 1,
      tenant_id: "5d1f6a52-3b7c-4d3e-8f4a-0c9b2e1d7a66",
      artifact_inputs: [],
      checkpoint_id: null,
      idempotency_key: valid.idempotency_key,
    };
    expect(QueueMessageSchema.safeParse(base).success).toBe(true);
    expect(QueueMessageSchema.safeParse({ ...base, stage_id: "S99" }).success).toBe(false);
    expect(STAGES).toHaveLength(14);
  });
});

describe("ulid", () => {
  it("gera 26 caracteres válidos, únicos e ordenados por tempo", () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    expect(a).toMatch(ULID_REGEX);
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => ulid())).size).toBe(1000);
  });

  it("rejeita timestamps inválidos", () => {
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(2 ** 48)).toThrow(RangeError);
  });
});

describe("loadConfig", () => {
  const env = {
    SUPABASE_URL: "https://abc.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "k".repeat(30),
    FORGE_HMAC_KEY_ID: "game-main",
    FORGE_HMAC_SECRET: "s".repeat(40),
    CRON_SECRET: "c".repeat(40),
  };

  it("carrega config mínima com defaults", () => {
    const r = loadConfig(env);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.APP_ENV).toBe("development");
      expect(r.config.OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
    }
  });

  it("trata string vazia como ausente e lista só nomes", () => {
    const r = loadConfig({ ...env, CRON_SECRET: "", FORGE_HMAC_SECRET: "curto" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("CRON_SECRET");
      expect(r.invalid).toContain("FORGE_HMAC_SECRET");
      expect(JSON.stringify(r)).not.toContain("curto");
    }
  });
});
