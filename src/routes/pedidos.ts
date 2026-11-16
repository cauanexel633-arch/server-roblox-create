import type { FastifyInstance } from 'fastify';
import { tokenValido } from '../auth.js';
import { classificarEntrada } from '../dominio/schemas.js';
import { processarPedido, type DependenciasPedido } from '../dominio/processarPedido.js';

export interface OpcoesRota extends DependenciasPedido {
  tokenEsperado: string;
}

export function registrarRotaPedidos(app: FastifyInstance, opts: OpcoesRota): void {
  app.post('/pedidos', async (req, reply) => {
    if (!tokenValido(req.headers.authorization, opts.tokenEsperado)) {
      return reply.code(401).send({ ok: false, erro: 'nao_autorizado' });
    }

    const classificacao = classificarEntrada(req.body);
    if (!classificacao.ok) {
      if (classificacao.salvar) {
        await opts.repo.registrarFalha({
          jogadorId: classificacao.jogador_id,
          tipo: classificacao.tipo,
          pedidoTexto: classificacao.pedido_texto,
          motivoCodigo: 'texto_invalido',
          motivoDetalhe: classificacao.detalhe,
          respostaIA: null,
        });
        return reply.code(400).send({ ok: false, motivo: 'texto_invalido' });
      }
      return reply.code(400).send({ ok: false, erro: 'entrada_invalida' });
    }

    const resultado = await processarPedido(classificacao.entrada, opts);
    return reply.code(200).send(resultado);
  });
}
