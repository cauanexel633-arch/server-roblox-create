import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { AppError, toProblem, ulid, type ConfigResult } from "../../packages/shared/src/index.js";
import { registerRawBody } from "./middleware/raw-body.js";
import { registerRoutes } from "./routes/index.js";
import type { AppDeps } from "./types.js";

export type { AppDeps } from "./types.js";

/** Opções do Fastify (logger com redação de segredos, ids de requisição ULID). */
export function fastifyOptions(configResult: ConfigResult): FastifyServerOptions {
  return {
    logger: {
      level: configResult.ok ? configResult.config.LOG_LEVEL : "info",
      // Nunca registrar credenciais ou assinaturas completas (seção 16).
      redact: {
        paths: [
          "req.headers.authorization",
          'req.headers["x-forge-signature"]',
          'req.headers["x-forge-nonce"]',
          "req.headers.cookie",
        ],
        censor: "[REDACTED]",
      },
    },
    genReqId: () => ulid(),
    requestIdHeader: false,
    // Corpo máximo global; o parser JSON aplica um limite próprio menor.
    bodyLimit: 64 * 1024,
  };
}

/** Registra hooks, parser de corpo bruto, tratamento de erros e rotas numa instância Fastify. */
export function configureApp(app: FastifyInstance, deps: AppDeps): FastifyInstance {
  app.addHook("onSend", async (req, reply) => {
    reply.header("x-trace-id", String(req.id));
    reply.header("cache-control", "no-store");
  });

  registerRawBody(app);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .code(err.status)
        .type("application/problem+json")
        .send(toProblem(err, String(req.id)));
    }
    const status =
      typeof (err as { statusCode?: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    if (status >= 500) req.log.error({ err }, "unhandled_error");
    const problem = toProblem(
      new AppError(
        status,
        status === 500 ? "internal_error" : "request_error",
        status === 500 ? "Erro interno" : "Requisição inválida",
      ),
      String(req.id),
    );
    return reply.code(status).type("application/problem+json").send(problem);
  });

  registerRoutes(app, deps);
  return app;
}

/** Conveniência para testes: cria a instância e a configura. */
export function buildApp(deps: AppDeps): FastifyInstance {
  return configureApp(Fastify(fastifyOptions(deps.configResult)), deps);
}
