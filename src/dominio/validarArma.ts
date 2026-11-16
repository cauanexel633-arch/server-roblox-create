import { somarCusto } from './custo.js';
import { FalhaNegocio, type Custo, type Peca } from './tipos.js';

export const MAX_QTD_POR_PECA = 10;
export const MAX_PECAS_DISTINTAS = 12;

export interface PecaArmaIA {
  id: string;
  qtd: number;
}

export interface ReceitaArma {
  nome: string;
  pecas: PecaArmaIA[];
}

export function validarArma(
  dados: { nome: string; pecas: PecaArmaIA[] },
  catalogo: ReadonlyMap<string, Peca>,
): { receita: ReceitaArma; custo: Custo } {
  const somadas = new Map<string, number>();

  for (const p of dados.pecas) {
    if (!catalogo.has(p.id)) {
      throw new FalhaNegocio('peca_inexistente', p.id);
    }
    if (!Number.isInteger(p.qtd) || p.qtd < 1 || p.qtd > MAX_QTD_POR_PECA) {
      throw new FalhaNegocio(
        'quantidade_invalida',
        `${p.id}: quantidade ${p.qtd} fora de 1 a ${MAX_QTD_POR_PECA}`,
      );
    }
    somadas.set(p.id, (somadas.get(p.id) ?? 0) + p.qtd);
  }

  if (somadas.size > MAX_PECAS_DISTINTAS) {
    throw new FalhaNegocio('quantidade_invalida', `mais de ${MAX_PECAS_DISTINTAS} peças distintas`);
  }
  for (const [id, total] of somadas) {
    if (total > MAX_QTD_POR_PECA) {
      throw new FalhaNegocio('quantidade_invalida', `${id}: total ${total} acima de ${MAX_QTD_POR_PECA}`);
    }
  }

  const pecas = [...somadas].map(([id, qtd]) => ({ id, qtd }));
  const custo = somarCusto(
    pecas.map((p) => ({ custo: catalogo.get(p.id)!.custo, quantidade: p.qtd })),
  );

  return { receita: { nome: dados.nome, pecas }, custo };
}
