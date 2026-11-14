import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "../../../packages/shared/src/index.js";
import { verifyHmacRequest } from "../../../packages/security/src/index.js";
import type { AppDeps } from "../types.js";

/**
 * preHandler que exige requisição assinada (HMAC-SHA256). O motivo exato da
 * falha vai apenas para o log; o cliente recebe sempre um 401 genérico para
 * não servir de oráculo a quem está sondando a autenticação.
 */
export function hmacAuth(deps: AppDeps) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!deps.keyResolver || !deps.nonceStore) {
      // Sem armazenamento de nonce não existe proteção anti-replay: falha fechada.
      throw Errors.notReady("Autenticação indisponível: armazenamento anti-replay não configurado.");
    }

    const result = await verifyHmacRequest({
      headers: req.headers,
      rawBody: req.rawBody ?? Buffer.alloc(0),
      nowSeconds: deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1000),
      keys: deps.keyResolver,
      nonces: deps.nonceStore,
    });

    if (!result.ok) {
      req.log.warn({ reason: result.reason }, "hmac_rejected");
      throw Errors.unauthorized();
    }
    req.authKeyId = result.keyId;
  };
}
