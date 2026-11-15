import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  FORGE_HMAC_KEY_ID: z.string().default("primary"),
  FORGE_HMAC_KEY_ID_PREVIOUS: z.string().optional(),
  FORGE_HMAC_SECRET: z.string().min(32).optional(),
  FORGE_HMAC_SECRET_PREVIOUS: z.string().min(32).optional(),
  // Shared only by trusted Roblox server Scripts and the Forge3D API. Never expose to clients.
  FORGE_ROBLOX_TOKEN: z.string().min(32).optional(),
  ROBLOX_OPEN_CLOUD_API_KEY: z.string().min(1).optional(),
  ROBLOX_CREATOR_USER_ID: z.string().regex(/^\d{1,20}$/).optional(),
  CRON_SECRET: z.string().min(24).optional(),
  APP_ENV: z.enum(["development", "preview", "production"]).default("production"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OPENROUTER_SITE_URL: z.string().url().optional(),
  OPENROUTER_APP_NAME: z.string().default("Forge3D Cloud"),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(10).default(3),
  MAX_JOBS_PER_WORKER_TICK: z.coerce.number().int().min(1).max(50).default(10),
  MAX_TRIANGLES: z.coerce.number().int().min(100).max(50000).default(20000),
  MAX_PLAYER_JOBS_PER_HOUR: z.coerce.number().int().min(1).max(20).default(3)
});

export const config = schema.parse(Object.fromEntries(Object.entries(process.env).map(([key,value]) => [key, value === "" ? undefined : value])));
export const hasSupabase = Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
export const hasOpenRouter = Boolean(config.OPENROUTER_API_KEY);
