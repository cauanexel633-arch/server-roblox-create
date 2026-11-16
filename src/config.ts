import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AI_PROVIDER: z.enum(['openrouter']),
  AI_MODEL: z.string().min(1),
  AI_API_KEY: z.string().min(1),
  GAME_SHARED_TOKEN: z.string().min(16),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  AI_TIMEOUT_MAP_MS: z.coerce.number().int().positive().default(20000),
  RATE_LIMIT_POR_MINUTO: z.coerce.number().int().positive().default(10),
});

export type Config = z.infer<typeof schema>;

// Mensagem de erro cita apenas nomes de variáveis, nunca valores.
export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const campos = r.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuração inválida nas variáveis: ${campos}`);
  }
  return r.data;
}
