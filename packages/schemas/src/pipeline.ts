import { z } from "zod";

/** Estágios da state machine (seção 6 do documento mestre). */
export const STAGES = [
  "S1_INTERPRET",
  "S2_RESEARCH",
  "S3_CONCEPT",
  "S4_MODEL",
  "S5_TEXTURE",
  "S6_RIG",
  "S7_ANIMATE",
  "S8_VFX",
  "S9_SCRIPT",
  "S10_REVIEW",
  "S11_SECURITY_AUDIT",
  "S12_OPTIMIZE",
  "S13_PACKAGE",
  "S14_PERSIST_DELIVER",
] as const;

export const StageIdSchema = z.enum(STAGES);
export type StageId = z.infer<typeof StageIdSchema>;

/** Referência a um artefato no Storage — nunca o conteúdo binário. */
export const ArtifactRefSchema = z.object({
  bucket: z.enum([
    "meshes",
    "textures",
    "animations",
    "packages",
    "references",
    "previews",
    "scripts",
  ]),
  path: z.string().min(1).max(512),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  mime_type: z.string().min(1).max(128),
  size_bytes: z.number().int().nonnegative(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

/** Mensagem de fila (seção 2.3). Transporta apenas handles, nunca malhas/texturas. */
export const QueueMessageSchema = z.object({
  job_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  stage_id: StageIdSchema,
  trace_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  attempt: z.number().int().min(1).max(10),
  tenant_id: z.string().uuid(),
  artifact_inputs: z.array(ArtifactRefSchema).max(64),
  checkpoint_id: z.string().uuid().nullable(),
  idempotency_key: z.string().uuid(),
});
export type QueueMessage = z.infer<typeof QueueMessageSchema>;
