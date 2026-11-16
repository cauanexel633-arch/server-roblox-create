export const TIPOS = ['arma', 'mapa'] as const;
export type Tipo = (typeof TIPOS)[number];

export type MotivoCodigo =
  | 'texto_invalido'
  | 'json_invalido'
  | 'peca_inexistente'
  | 'quantidade_invalida'
  | 'materiais_insuficientes'
  | 'pedido_impossivel'
  | 'layout_invalido'
  | 'limite_excedido'
  | 'erro_api';

export type Custo = Record<string, number>;
export type Inventario = Record<string, number>;

export interface Peca {
  id: string;
  nome: string;
  tipo: Tipo;
  categoria: string;
  custo: Custo;
  propriedades: Record<string, unknown>;
  ativo: boolean;
}

export interface Entrada {
  jogador_id: number;
  tipo: Tipo;
  descricao: string;
  inventario: Inventario;
}

/** Falha de regra de negócio, mapeada para um código de motivo. */
export class FalhaNegocio extends Error {
  constructor(
    readonly motivo: MotivoCodigo,
    readonly detalhe: string,
    readonly respostaIA?: unknown,
  ) {
    super(`${motivo}: ${detalhe}`);
  }
}
