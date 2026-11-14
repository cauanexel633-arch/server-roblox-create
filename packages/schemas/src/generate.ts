import { z } from "zod";

/** Remove caracteres de controle (exceto \n e \t) e normaliza espaços nas pontas. */
const sanitizedText = (min: number, max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min).max(max));

const dottedId = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/, "formato esperado: dominio.subtipo");

export const QUALITY_PRESETS = ["low", "medium", "high", "ultra", "cinematic"] as const;
export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;

export const PlayerSchema = z.object({
  // Declaração do servidor do jogo; NÃO é prova de identidade por si só.
  user_id: z.number().int().positive().safe(),
  username: sanitizedText(1, 64),
});

export const ConstraintsSchema = z
  .object({
    max_tris: z.number().int().min(500).max(100_000).optional(),
    rarity: z.enum(RARITIES).optional(),
    level: z.number().int().min(1).max(1000).optional(),
    quality: z.enum(QUALITY_PRESETS).default("high"),
  })
  .default({ quality: "high" });

export const GenerateRequestSchema = z.object({
  player: PlayerSchema,
  weapon_description: sanitizedText(3, 1000),
  category: dottedId,
  style: dottedId,
  preset_prompt_id: z
    .string()
    .regex(/^[a-z0-9]+(\.[a-z0-9_]+)*\.v\d+$/, "formato esperado: nome.versao (ex.: roblox.default.v3)")
    .optional(),
  constraints: ConstraintsSchema,
  idempotency_key: z.string().uuid(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const JOB_STATUSES = [
  "queued",
  "running",
  "waiting_capacity",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const GenerateResponseSchema = z.object({
  job_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  status: JobStatusSchema,
  progress: z.number().min(0).max(100),
  status_url: z.string(),
  stream_url: z.string(),
});

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
