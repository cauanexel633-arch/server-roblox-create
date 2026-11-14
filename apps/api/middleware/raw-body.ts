import type { FastifyInstance } from "fastify";
import { Errors } from "../../../packages/shared/src/index.js";

/**
 * Preserva os bytes originais do corpo JSON: a assinatura HMAC é calculada
 * sobre o corpo bruto, e re-serializar o JSON invalidaria a assinatura.
 */
export function registerRawBody(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 64 * 1024 },
    (req, body, done) => {
      const raw = body as Buffer;
      req.rawBody = raw;
      if (raw.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(raw.toString("utf8")) as unknown);
      } catch {
        done(Errors.validation("Corpo não é JSON válido."), undefined);
      }
    },
  );
}
