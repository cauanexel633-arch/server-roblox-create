import { ErroProvedor, type PedidoIA, type ProvedorIA } from '../src/ia/provedor.js';
import type { NovaCriacao, NovaFalha, RepositorioPedidos } from '../src/dominio/processarPedido.js';
import type { Peca, Tipo } from '../src/dominio/tipos.js';

export function peca(p: Pick<Peca, 'id' | 'tipo' | 'categoria'> & Partial<Peca>): Peca {
  return {
    nome: p.nome ?? p.id,
    custo: p.custo ?? {},
    propriedades: p.propriedades ?? {},
    ativo: p.ativo ?? true,
    id: p.id,
    tipo: p.tipo,
    categoria: p.categoria,
  };
}

export const CATALOGO_ARMA: Peca[] = [
  peca({ id: 'arma_pistola', tipo: 'arma', categoria: 'base', custo: { metal: 4, madeira: 1 }, propriedades: { dano: 10 } }),
  peca({ id: 'proj_bala', tipo: 'arma', categoria: 'projetil', custo: { metal: 1, polvora: 1 }, propriedades: { empilhavel: true } }),
  // 12 peças extras para testar o limite de peças distintas (13 no total)
  ...Array.from({ length: 12 }, (_, i) =>
    peca({ id: `arma_extra_${i}`, tipo: 'arma', categoria: 'cano', custo: { metal: 1 } }),
  ),
];

export const CATALOGO_MAPA: Peca[] = [
  peca({ id: 'mapa_chao', tipo: 'mapa', categoria: 'chao', propriedades: { empilhavel: true } }),
  peca({ id: 'mapa_pilar', tipo: 'mapa', categoria: 'estrutura', custo: { metal: 2 }, propriedades: { empilhavel: false } }),
  peca({ id: 'mapa_spawn', tipo: 'mapa', categoria: 'spawn', propriedades: { empilhavel: true } }),
  peca({ id: 'mapa_decoracao', tipo: 'mapa', categoria: 'decoracao', custo: { madeira: 1 }, propriedades: { empilhavel: true } }),
];

export function catalogoMapaComo(): Map<string, Peca> {
  return new Map(CATALOGO_MAPA.map((p) => [p.id, p]));
}

export function catalogoArmaComo(): Map<string, Peca> {
  return new Map(CATALOGO_ARMA.map((p) => [p.id, p]));
}

export interface RepoFalso extends RepositorioPedidos {
  criacoes: NovaCriacao[];
  falhas: NovaFalha[];
}

export function repoFalso(pecas: Peca[] = [...CATALOGO_ARMA, ...CATALOGO_MAPA]): RepoFalso {
  const criacoes: NovaCriacao[] = [];
  const falhas: NovaFalha[] = [];
  return {
    criacoes,
    falhas,
    async carregarPecas(tipo: Tipo) {
      return pecas.filter((p) => p.tipo === tipo && p.ativo);
    },
    async registrarCriacao(c: NovaCriacao) {
      criacoes.push(c);
      return 'uuid-criacao';
    },
    async registrarFalha(f: NovaFalha) {
      falhas.push(f);
    },
  };
}

export interface IaFalsa extends ProvedorIA {
  chamadas: PedidoIA[];
}

export function iaFalsa(resposta: string | ErroProvedor): IaFalsa {
  const chamadas: PedidoIA[] = [];
  return {
    chamadas,
    async gerarTexto(pedido: PedidoIA) {
      chamadas.push(pedido);
      if (resposta instanceof ErroProvedor) throw resposta;
      return resposta;
    },
  };
}
