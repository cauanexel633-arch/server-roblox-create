/**
 * Entrypoint detectado pelo zero-config de Fastify da Vercel
 * (https://vercel.com/docs/frameworks/backend/fastify): a aplicação vira uma
 * única Vercel Function. O build da Vercel exige que este arquivo importe
 * `fastify` diretamente, por isso a instância é criada aqui e configurada em
 * `apps/api`. Localmente, `pnpm dev` sobe o mesmo servidor.
 */
import Fastify from "fastify";
import { configureApp, fastifyOptions } from "../apps/api/index.js";
import { loadConfig } from "../packages/shared/src/index.js";
import { EnvKeyResolver } from "../packages/security/src/index.js";

const configResult = loadConfig(process.env);

const keyResolver = configResult.ok
  ? new EnvKeyResolver(
      configResult.config.FORGE_HMAC_KEY_ID,
      configResult.config.FORGE_HMAC_SECRET,
      configResult.config.FORGE_HMAC_SECRET_PREVIOUS,
    )
  : undefined;

const app = Fastify(fastifyOptions(configResult));

// NonceStore, JobGateway e QueueProcessor são ligados nas fases F1/F2.
configureApp(app, {
  configResult,
  ...(keyResolver ? { keyResolver } : {}),
});

app.listen({ port: Number(process.env.PORT ?? 3000) });
