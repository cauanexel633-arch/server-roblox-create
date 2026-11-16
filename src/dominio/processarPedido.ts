import { verificarInventario } from './custo.js';
import { respostaArmaSchema, respostaMapaSchema, resumoZod } from './schemas.js';
import { FalhaNegocio, type Custo, type Entrada, type MotivoCodigo, type Peca, type Tipo } from './tipos.js';
import { validarArma } from './validarArma.js';
import { validarMapa } from './validarMapa.js';
import { mensagemUsuario, promptSistemaArma, promptSistemaMapa } from '../ia/prompts.js';
import { ErroProvedor, type ProvedorIA } from '../ia/provedor.js';
import type { LimitadorRate } from '../ratelimit.js';

export interface NovaCriacao {
  jogadorId: number;
  tipo: Tipo;
  pedidoTexto: string;
  nome: string;
  pecas: unknown;
  layout: unknown;
  custoTotal: Custo;
}

export interface NovaFalha {
  jogadorId: number | null;
  tipo: Tipo;
  pedidoTexto: string | null;
  motivoCodigo: MotivoCodigo;
  motivoDetalhe: string | null;
  respostaIA: unknown;
}

export interface RepositorioPedidos {
  carregarPecas(tipo: Tipo): Promise<Peca[]>;
  /** Salva a criação via rpc no Supabase e devolve o id. */
  registrarCriacao(criacao: NovaCriacao): Promise<string>;
  registrarFalha(falha: NovaFalha): Promise<void>;
}

export interface DependenciasPedido {
  repo: RepositorioPedidos;
  ia: ProvedorIA;
  limitador: LimitadorRate;
  timeouts: { arma: number; mapa: number };
}

export type ResultadoPedido =
  | { ok: true; id: string; tipo: Tipo; receita: unknown; custo: Custo }
  | { ok: false; motivo: MotivoCodigo; detalhe: string };

export async function processarPedido(entrada: Entrada, deps: DependenciasPedido): Promise<ResultadoPedido> {
  const { jogador_id: jogadorId, tipo, descricao, inventario } = entrada;

  const falhar = async (
    motivo: MotivoCodigo,
    detalhe: string,
    respostaIA: unknown = null,
  ): Promise<ResultadoPedido> => {
    await deps.repo.registrarFalha({
      jogadorId,
      tipo,
      pedidoTexto: descricao,
      motivoCodigo: motivo,
      motivoDetalhe: detalhe,
      respostaIA,
    });
    return { ok: false, motivo, detalhe };
  };

  const persistir = async (
    nome: string,
    receita: unknown,
    custo: Custo,
    pecas: unknown,
    layout: unknown,
  ): Promise<ResultadoPedido> => {
    const id = await deps.repo.registrarCriacao({
      jogadorId,
      tipo,
      pedidoTexto: descricao,
      nome,
      pecas,
      layout,
      custoTotal: custo,
    });
    return { ok: true, id, tipo, receita, custo };
  };

  if (!deps.limitador.permitir(String(jogadorId))) {
    return falhar('limite_excedido', 'rate limit por jogador atingido');
  }

  const pecas = await deps.repo.carregarPecas(tipo);
  const catalogo = new Map(pecas.map((p) => [p.id, p] as const));
  const system = tipo === 'arma' ? promptSistemaArma(pecas) : promptSistemaMapa(pecas);
  const user = mensagemUsuario(descricao, inventario);
  const timeoutMs = tipo === 'arma' ? deps.timeouts.arma : deps.timeouts.mapa;

  let bruto: string;
  try {
    bruto = await deps.ia.gerarTexto({ system, user, timeoutMs });
  } catch (e) {
    if (e instanceof ErroProvedor) {
      return falhar('erro_api', e.status ? `${e.causa} ${e.status}` : e.causa);
    }
    throw e;
  }

  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return falhar('json_invalido', 'resposta não é JSON', { texto: bruto.slice(0, 1000) });
  }

  try {
    if (tipo === 'arma') {
      const r = respostaArmaSchema.safeParse(dados);
      if (!r.success) return falhar('json_invalido', resumoZod(r.error), dados);
      const resp = r.data;
      if (!resp.ok) return falhar('pedido_impossivel', resp.motivo, dados);

      const { receita, custo } = validarArma(resp, catalogo);
      verificarInventario(custo, inventario);
      return await persistir(receita.nome, receita, custo, receita.pecas, null);
    }

    const r = respostaMapaSchema.safeParse(dados);
    if (!r.success) return falhar('json_invalido', resumoZod(r.error), dados);
    const resp = r.data;
    if (!resp.ok) return falhar('pedido_impossivel', resp.motivo, dados);

    const { receita, custo } = validarMapa(resp, catalogo);
    verificarInventario(custo, inventario);
    return await persistir(receita.nome, receita, custo, null, receita);
  } catch (e) {
    if (e instanceof FalhaNegocio) {
      return falhar(e.motivo, e.detalhe, e.respostaIA ?? dados);
    }
    throw e;
  }
}
