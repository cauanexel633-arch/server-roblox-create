import { describe, expect, it } from 'vitest';
import { tokenValido } from '../src/auth.js';
import { classificarEntrada } from '../src/dominio/schemas.js';
import { verificarInventario, somarCusto } from '../src/dominio/custo.js';
import { FalhaNegocio } from '../src/dominio/tipos.js';

const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';

const corpoBase = () => ({
  jogador_id: 123,
  tipo: 'arma',
  descricao: 'pistola leve',
  inventario: { metal: 10, madeira: 5 },
});

describe('autenticação', () => {
  it('rejeita token errado', () => {
    expect(tokenValido('Bearer errado', TOKEN)).toBe(false);
  });
  it('rejeita header ausente ou sem o prefixo Bearer', () => {
    expect(tokenValido(undefined, TOKEN)).toBe(false);
    expect(tokenValido(TOKEN, TOKEN)).toBe(false);
  });
  it('aceita token correto', () => {
    expect(tokenValido(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });
});

describe('validação de entrada', () => {
  it('aceita um corpo válido e faz trim da descrição', () => {
    const r = classificarEntrada({ ...corpoBase(), descricao: '  pistola  ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entrada.descricao).toBe('pistola');
  });

  it('descrição vazia gera texto_invalido salvo', () => {
    const r = classificarEntrada({ ...corpoBase(), descricao: '   ' });
    expect(r).toMatchObject({ ok: false, salvar: true, jogador_id: 123, tipo: 'arma' });
  });

  it('descrição com mais de 200 caracteres gera texto_invalido salvo', () => {
    const r = classificarEntrada({ ...corpoBase(), descricao: 'a'.repeat(201) });
    expect(r).toMatchObject({ ok: false, salvar: true });
  });

  it('jogador_id inválido não é salvo (problema estrutural)', () => {
    const r = classificarEntrada({ ...corpoBase(), jogador_id: 0 });
    expect(r).toMatchObject({ ok: false, salvar: false });
  });

  it('valor negativo no inventário é estrutural', () => {
    const r = classificarEntrada({ ...corpoBase(), inventario: { metal: -1 } });
    expect(r).toMatchObject({ ok: false, salvar: false });
  });

  it('mais de 50 chaves no inventário é estrutural', () => {
    const inventario = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`m${i}`, 1]));
    const r = classificarEntrada({ ...corpoBase(), inventario });
    expect(r).toMatchObject({ ok: false, salvar: false });
  });
});

describe('custo e inventário', () => {
  it('soma custo multiplicado pela quantidade', () => {
    expect(
      somarCusto([
        { custo: { metal: 4, madeira: 1 }, quantidade: 1 },
        { custo: { metal: 1 }, quantidade: 3 },
      ]),
    ).toEqual({ metal: 7, madeira: 1 });
  });

  it('falta de um único material gera materiais_insuficientes com o nome do material', () => {
    expect(() => verificarInventario({ metal: 6, polvora: 1 }, { metal: 10, polvora: 0 })).toThrow(FalhaNegocio);
    try {
      verificarInventario({ metal: 6, polvora: 1 }, { metal: 10, polvora: 0 });
    } catch (e) {
      expect((e as FalhaNegocio).motivo).toBe('materiais_insuficientes');
      expect((e as FalhaNegocio).detalhe).toBe('polvora');
    }
  });

  it('inventário exato é suficiente', () => {
    expect(() => verificarInventario({ metal: 6 }, { metal: 6 })).not.toThrow();
  });
});
