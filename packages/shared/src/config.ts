import { z } from "zod";

/**
 * Variáveis OBRIGATÓRIAS para a plataforma operar. A ausência de qualquer
 * uma delas torna o /ready indisponível (fail-closed).
 */
const requiredSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  FORGE_HMAC_KEY_ID: z.string().min(3).max(64).regex(/^[A-Za-z0-9_.-]+$/),
  FORGE_HMAC_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
});

/**
 * Variáveis OPCIONAIS. Integrações cujas credenciais faltam ficam marcadas
 * como "aguardando credencial" e nunca como funcionais.
 */
const optionalSchema = z.object({
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_DB_URL: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  WEB_SEARCH_API_KEY: z.string().min(1).optional(),
  ROBLOX_UNIVERSE_ID: z.string().regex(/^\d+$/).optional(),
  ROBLOX_OPEN_CLOUD_API_KEY: z.string().min(1).optional(),
  // Segredo anterior aceito durante a rotação (mesmo key id).
  FORGE_HMAC_SECRET_PREVIOUS: z.string().min(32).optional(),
  ED25519_PRIVATE_KEY: z.string().min(1).optional(),
  ED25519_PUBLIC_KEY: z.string().min(1).optional(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type RequiredConfig = z.infer<typeof requiredSchema>;
export type OptionalConfig = z.infer<typeof optionalSchema>;
export type AppConfig = RequiredConfig & OptionalConfig;

export type ConfigResult =
  | { ok: true; config: AppConfig }
  | { ok: false; missing: string[]; invalid: string[] };

/** Trata strings vazias (formato de .env.example) como variável ausente. */
function clean(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v.trim() !== "") out[k] = v;
  }
  return out;
}

export function loadConfig(env: Record<string, string | undefined>): ConfigResult {
  const cleaned = clean(env);
  const req = requiredSchema.safeParse(cleaned);
  const opt = optionalSchema.safeParse(cleaned);

  const missing: string[] = [];
  const invalid: string[] = [];
  for (const parsed of [req, opt]) {
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "?");
      if (issue.code === "invalid_type" && issue.received === "undefined") missing.push(key);
      else invalid.push(key);
    }
  }

  if (!req.success || !opt.success) return { ok: false, missing, invalid };
  return { ok: true, config: { ...req.data, ...opt.data } };
}
