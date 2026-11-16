import { somarCusto } from './custo.js';
import { FalhaNegocio, type Custo, type Peca } from './tipos.js';

export const MAX_PECAS_MAPA = 400;
export const MAX_LADO_MAPA = 40;
const ROTACOES_VALIDAS = new Set([0, 90, 180, 270]);

export interface PecaMapaIA {
  id: string;
  x: number;
  z: number;
  rot: number;
}

export interface DadosMapa {
  nome: string;
  tamanho: { largura: number; comprimento: number };
  pecas: PecaMapaIA[];
}

export interface ReceitaMapa {
  nome: string;
  tamanho: { largura: number; comprimento: number };
  pecas: PecaMapaIA[];
}

function inteiroEntre(valor: number, min: number, max: number): boolean {
  return Number.isInteger(valor) && valor >= min && valor <= max;
}

export function validarMapa(
  dados: DadosMapa,
  catalogo: ReadonlyMap<string, Peca>,
): { receita: ReceitaMapa; custo: Custo } {
  const { largura, comprimento } = dados.tamanho;

  if (!inteiroEntre(largura, 1, MAX_LADO_MAPA) || !inteiroEntre(comprimento, 1, MAX_LADO_MAPA)) {
    throw new FalhaNegocio(
      'quantidade_invalida',
      `tamanho ${largura}x${comprimento} fora de 1 a ${MAX_LADO_MAPA}`,
    );
  }
  if (dados.pecas.length > MAX_PECAS_MAPA) {
    throw new FalhaNegocio('limite_excedido', `${dados.pecas.length} peças, máximo ${MAX_PECAS_MAPA}`);
  }

  const celulas = new Map<string, Peca[]>();
  for (const p of dados.pecas) {
    const peca = catalogo.get(p.id);
    if (!peca) {
      throw new FalhaNegocio('peca_inexistente', p.id);
    }
    if (!ROTACOES_VALIDAS.has(p.rot)) {
      throw new FalhaNegocio('layout_invalido', `${p.id}: rotação ${p.rot} inválida`);
    }
    const dentro =
      Number.isInteger(p.x) &&
      Number.isInteger(p.z) &&
      p.x >= 0 &&
      p.z >= 0 &&
      p.x < largura &&
      p.z < comprimento;
    if (!dentro) {
      throw new FalhaNegocio('layout_invalido', `${p.id} fora dos limites em (${p.x},${p.z})`);
    }
    const chave = `${p.x},${p.z}`;
    const lista = celulas.get(chave) ?? [];
    lista.push(peca);
    celulas.set(chave, lista);
  }

  for (const [chave, lista] of celulas) {
    const naoEmpilhaveis = lista.filter((p) => p.propriedades.empilhavel !== true).length;
    if (naoEmpilhaveis > 1) {
      throw new FalhaNegocio('layout_invalido', `sobreposição em (${chave})`);
    }
    const temEstrutura = lista.some((p) => p.categoria === 'estrutura');
    const temChao = lista.some((p) => p.categoria === 'chao');
    if (temEstrutura && !temChao) {
      throw new FalhaNegocio('layout_invalido', `estrutura sem chão em (${chave})`);
    }
  }

  const temSpawn = dados.pecas.some((p) => catalogo.get(p.id)!.categoria === 'spawn');
  if (!temSpawn) {
    throw new FalhaNegocio('layout_invalido', 'o mapa precisa de ao menos uma peça spawn');
  }

  const custo = somarCusto(
    dados.pecas.map((p) => ({ custo: catalogo.get(p.id)!.custo, quantidade: 1 })),
  );

  return {
    receita: {
      nome: dados.nome,
      tamanho: { largura, comprimento },
      pecas: dados.pecas.map((p) => ({ id: p.id, x: p.x, z: p.z, rot: p.rot })),
    },
    custo,
  };
}
