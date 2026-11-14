/**
 * Entrypoint detectado pelo zero-config de Fastify da Vercel
 * (https://vercel.com/docs/frameworks/backend/fastify): a aplicação vira uma
 * única Vercel Function. Localmente, `pnpm dev` sobe o mesmo servidor.
 */
import { buildApp } from "../apps/api/index.js";
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

// NonceStore, JobGateway e QueueProcessor são ligados nas fases F1/F2.
const app = buildApp({
  configResult,
  ...(keyResolver ? { keyResolver } : {}),
});

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
