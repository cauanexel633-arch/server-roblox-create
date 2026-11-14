import type { FastifyReply, FastifyRequest } from "fastify";
import { GenerateRequestSchema } from "../../../packages/schemas/src/index.js";
import { Errors } from "../../../packages/shared/src/index.js";
import type { AppDeps } from "../types.js";

export function generate(deps: AppDeps) {
  return async function handler(req: FastifyRequest, reply: FastifyReply) {
    const parsed = GenerateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
        .join("; ");
      throw Errors.validation(detail);
    }

    if (!deps.jobs || !req.authKeyId) {
      throw Errors.notReady("Criação de jobs indisponível: persistência/fila ainda não configuradas.");
    }

    const response = await deps.jobs.createJob({
      keyId: req.authKeyId,
      request: parsed.data,
      traceId: String(req.id),
    });
    return reply.code(202).send(response);
  };
}
