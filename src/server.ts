import { criarApp } from './criar-app.js';
import { carregarConfig } from './config.js';
import { criarRepositorioSupabase } from './db/supabase.js';
import { criarProvedor } from './ia/provedor.js';
import { LimitadorJanela } from './ratelimit.js';

const config = carregarConfig();

const app = criarApp({
  tokenEsperado: config.GAME_SHARED_TOKEN,
  repo: criarRepositorioSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
  ia: criarProvedor(config),
  limitador: new LimitadorJanela(config.RATE_LIMIT_POR_MINUTO),
  timeouts: { arma: config.AI_TIMEOUT_MS, mapa: config.AI_TIMEOUT_MAP_MS },
  logger: true,
});

await app.listen({ port: config.PORT, host: '0.0.0.0' });
