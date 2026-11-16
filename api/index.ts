import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';
import { carregarConfig } from '../src/config.js';
import { criarRepositorioSupabase } from '../src/db/supabase.js';
import { criarProvedor } from '../src/ia/provedor.js';
import { LimitadorJanela } from '../src/ratelimit.js';

// Instância reutilizada entre invocações da mesma função serverless.
let app: FastifyInstance | undefined;

function obterApp(): FastifyInstance {
  if (!app) {
    const config = carregarConfig();
    app = criarApp({
      tokenEsperado: config.GAME_SHARED_TOKEN,
      repo: criarRepositorioSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
      ia: criarProvedor(config),
      limitador: new LimitadorJanela(config.RATE_LIMIT_POR_MINUTO),
      timeouts: { arma: config.AI_TIMEOUT_MS, mapa: config.AI_TIMEOUT_MAP_MS },
      logger: true,
    });
  }
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const instancia = obterApp();
  await instancia.ready();
  instancia.server.emit('request', req, res);
}
