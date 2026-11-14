import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "../../../packages/shared/src/index.js";
import type { AppDeps } from "../types.js";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Compara `Authorization: Bearer <CRON_SECRET>` em tempo constante (via hash de tamanho fixo). */
export function isValidCronAuth(authorization: string | undefined, cronSecret: string): boolean {
  if (!authorization) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${cronSecret}`));
}

/**
 * Rota chamada pelo Vercel Cron. O Vercel Cron usa GET com
 * `Authorization: Bearer $CRON_SECRET`; POST é aceito para disparo manual autenticado.
 */
export function processQueue(deps: AppDeps) {
  return async function handler(req: FastifyRequest, reply: FastifyReply) {
    if (!deps.configResult.ok) throw Errors.notReady("Configuração inválida.");
    if (!isValidCronAuth(req.headers.authorization, deps.configResult.config.CRON_SECRET)) {
      throw Errors.unauthorized();
    }
    if (!deps.queue) {
      throw Errors.notReady("Processador de fila ainda não instalado (F2).");
    }
    const result = await deps.queue.processBatch({ traceId: String(req.id) });
    return reply.code(200).send(result);
  };
}
