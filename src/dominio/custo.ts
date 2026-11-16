import { FalhaNegocio, type Custo, type Inventario } from './tipos.js';

export function somarCusto(parcelas: Array<{ custo: Custo; quantidade: number }>): Custo {
  const total: Custo = {};
  for (const { custo, quantidade } of parcelas) {
    for (const [material, valor] of Object.entries(custo)) {
      total[material] = (total[material] ?? 0) + valor * quantidade;
    }
  }
  return total;
}

export function verificarInventario(custo: Custo, inventario: Inventario): void {
  for (const [material, necessario] of Object.entries(custo)) {
    const disponivel = inventario[material] ?? 0;
    if (necessario > disponivel) {
      throw new FalhaNegocio('materiais_insuficientes', material);
    }
  }
}
