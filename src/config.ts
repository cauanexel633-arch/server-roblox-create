import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  FORGE_HMAC_KEY_ID: z.string().default("primary"),
  FORGE_HMAC_SECRET: z.string().min(32).optional(),
  FORGE_HMAC_SECRET_PREVIOUS: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("production"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OPENROUTER_SITE_URL: z.string().url().optional(),
  OPENROUTER_APP_NAME: z.string().default("Forge3D Cloud"),
  MAX_JOB_STAGES_PER_TICK: z.coerce.number().int().min(1).max(10).default(1),
  MAX_TRIANGLES: z.coerce.number().int().min(100).max(50000).default(20000)
});

export const config = schema.parse(process.env);
export const hasSupabase = Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
export const hasOpenRouter = Boolean(config.OPENROUTER_API_KEY);