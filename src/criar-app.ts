import Fastify, { type FastifyInstance } from 'fastify';
import { registrarRotaPedidos, type OpcoesRota } from './routes/pedidos.js';

export interface OpcoesApp extends OpcoesRota {
  logger?: boolean;
}

export function criarApp(opts: OpcoesApp): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ? { redact: ['req.headers.authorization'] } : false,
    bodyLimit: 32 * 1024,
  });

  app.setErrorHandler((err, req, reply) => {
    const status = typeof err.statusCode === 'number' && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) {
      // Loga só o tipo do erro: a mensagem pode conter detalhes internos.
      req.log.error({ erro: err.name }, 'erro interno');
      return reply.code(500).send({ ok: false, erro: 'erro_interno' });
    }
    return reply.code(status).send({ ok: false, erro: 'entrada_invalida' });
  });

  registrarRotaPedidos(app, opts);
  return app;
}
