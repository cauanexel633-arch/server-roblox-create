import { z, type ZodError } from 'zod';
import { TIPOS, type Entrada, type Tipo } from './tipos.js';

const inventarioSchema = z
  .record(z.string().min(1).max(64), z.number().int().nonnegative())
  .refine((o) => Object.keys(o).length <= 50, { message: 'máximo 50 chaves' });

const estruturaSchema = z.object({
  jogador_id: z.number().int().positive(),
  tipo: z.enum(TIPOS),
  inventario: inventarioSchema,
});

const descricaoSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(200));

export type ClassificacaoEntrada =
  | { ok: true; entrada: Entrada }
  /** Problema estrutural: não há jogador_id confiável, nada é salvo. */
  | { ok: false; salvar: false; detalhe: string }
  /** Problema só na descrição: salva como texto_invalido. */
  | { ok: false; salvar: true; jogador_id: number; tipo: Tipo; pedido_texto: string; detalhe: string };

export function classificarEntrada(corpo: unknown): ClassificacaoEntrada {
  const body = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as Record<string, unknown>;

  const estrutura = estruturaSchema.safeParse(body);
  if (!estrutura.success) {
    return { ok: false, salvar: false, detalhe: 'estrutura inválida' };
  }

  const descricao = descricaoSchema.safeParse(body.descricao);
  if (!descricao.success) {
    const bruto = typeof body.descricao === 'string' ? body.descricao.slice(0, 500) : '';
    return {
      ok: false,
      salvar: true,
      jogador_id: estrutura.data.jogador_id,
      tipo: estrutura.data.tipo,
      pedido_texto: bruto,
      detalhe: 'descrição deve ter entre 1 e 200 caracteres após trim',
    };
  }

  return {
    ok: true,
    entrada: {
      jogador_id: estrutura.data.jogador_id,
      tipo: estrutura.data.tipo,
      inventario: estrutura.data.inventario,
      descricao: descricao.data,
    },
  };
}

// Contratos de resposta da IA
const pecaArmaSchema = z.object({ id: z.string().min(1), qtd: z.number().int() });
const pecaMapaSchema = z.object({
  id: z.string().min(1),
  x: z.number().int(),
  z: z.number().int(),
  rot: z.number().int(),
});

export const respostaArmaSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    nome: z.string().trim().min(1).max(60),
    pecas: z.array(pecaArmaSchema).min(1),
    motivo: z.null().optional(),
  }),
  z.object({
    ok: z.literal(false),
    motivo: z.string().min(1).max(200),
  }),
]);

export const respostaMapaSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    nome: z.string().trim().min(1).max(60),
    tamanho: z.object({ largura: z.number().int(), comprimento: z.number().int() }),
    pecas: z.array(pecaMapaSchema),
    motivo: z.null().optional(),
  }),
  z.object({
    ok: z.literal(false),
    motivo: z.string().min(1).max(200),
  }),
]);

/** Resumo curto e sem valores, útil para depuração. */
export function resumoZod(erro: ZodError): string {
  return erro.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(raiz)'}:${i.code}`)
    .join(', ');
}
