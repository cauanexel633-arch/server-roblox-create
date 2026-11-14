import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../types.js";

export function health() {
  return async function handler(): Promise<{ status: "ok" }> {
    return { status: "ok" };
  };
}

/**
 * Readiness reflete somente o que é verificável hoje: configuração válida e
 * dependências de autenticação ligadas. Checagens de Supabase entram na F1.
 */
export function ready(deps: AppDeps) {
  return async function handler(_req: FastifyRequest, reply: FastifyReply) {
    const checks = {
      config: deps.configResult.ok,
      auth_replay_store: deps.nonceStore !== undefined,
      job_gateway: deps.jobs !== undefined,
      queue_processor: deps.queue !== undefined,
    };
    const isReady = Object.values(checks).every(Boolean);
    const body: Record<string, unknown> = { status: isReady ? "ready" : "not_ready", checks };
    if (!deps.configResult.ok) {
      // Apenas NOMES de variáveis; nunca valores.
      body.missing_env = deps.configResult.missing;
      body.invalid_env = deps.configResult.invalid;
    }
    return reply.code(isReady ? 200 : 503).send(body);
  };
}
