import { describe, expect, it } from 'vitest';
import { validarArma } from '../src/dominio/validarArma.js';
import { FalhaNegocio } from '../src/dominio/tipos.js';
import { catalogoArmaComo } from './fixtures.js';

const cat = catalogoArmaComo();
const erro = (fn: () => unknown): FalhaNegocio => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FalhaNegocio) return e;
    throw e;
  }
  throw new Error('esperava FalhaNegocio');
};

describe('validarArma', () => {
  it('id inexistente gera peca_inexistente', () => {
    const e = erro(() => validarArma({ nome: 'x', pecas: [{ id: 'nao_existe', qtd: 1 }] }, cat));
    expect(e.motivo).toBe('peca_inexistente');
  });

  it('quantidade zero gera quantidade_invalida', () => {
    const e = erro(() => validarArma({ nome: 'x', pecas: [{ id: 'arma_pistola', qtd: 0 }] }, cat));
    expect(e.motivo).toBe('quantidade_invalida');
  });

  it('quantidade acima de 10 gera quantidade_invalida', () => {
    const e = erro(() => validarArma({ nome: 'x', pecas: [{ id: 'arma_pistola', qtd: 999 }] }, cat));
    expect(e.motivo).toBe('quantidade_invalida');
  });

  it('mais de 12 peças distintas gera quantidade_invalida', () => {
    const pecas = Array.from({ length: 13 }, (_, i) => {
      const id = i === 0 ? 'arma_pistola' : i === 1 ? 'proj_bala' : `arma_extra_${i - 2}`;
      return { id, qtd: 1 };
    });
    const e = erro(() => validarArma({ nome: 'x', pecas }, cat));
    expect(e.motivo).toBe('quantidade_invalida');
  });

  it('repetir o mesmo id soma as quantidades e respeita o limite de 10', () => {
    const e = erro(() =>
      validarArma(
        {
          nome: 'x',
          pecas: [
            { id: 'arma_pistola', qtd: 6 },
            { id: 'arma_pistola', qtd: 6 },
          ],
        },
        cat,
      ),
    );
    expect(e.motivo).toBe('quantidade_invalida');
  });

  it('monta receita e custo corretamente', () => {
    const r = validarArma(
      {
        nome: 'Pistola Lenta',
        pecas: [
          { id: 'arma_pistola', qtd: 1 },
          { id: 'proj_bala', qtd: 2 },
        ],
      },
      cat,
    );
    expect(r.receita.pecas).toEqual([
      { id: 'arma_pistola', qtd: 1 },
      { id: 'proj_bala', qtd: 2 },
    ]);
    expect(r.custo).toEqual({ metal: 6, madeira: 1, polvora: 2 });
  });
});
