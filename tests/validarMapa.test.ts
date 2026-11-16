import { describe, expect, it } from 'vitest';
import { validarMapa, type PecaMapaIA } from '../src/dominio/validarMapa.js';
import { FalhaNegocio } from '../src/dominio/tipos.js';
import { catalogoMapaComo } from './fixtures.js';

const cat = catalogoMapaComo();
const tamanho = { largura: 20, comprimento: 20 };
const base = (pecas: PecaMapaIA[], t = tamanho) => ({ nome: 'Arena', tamanho: t, pecas });
const spawn: PecaMapaIA = { id: 'mapa_spawn', x: 0, z: 0, rot: 0 };
const chao = (x: number, z: number): PecaMapaIA => ({ id: 'mapa_chao', x, z, rot: 0 });

const erro = (fn: () => unknown): FalhaNegocio => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FalhaNegocio) return e;
    throw e;
  }
  throw new Error('esperava FalhaNegocio');
};

describe('validarMapa', () => {
  it('sobreposição de peças não empilháveis gera layout_invalido', () => {
    const e = erro(() =>
      validarMapa(
        base([spawn, chao(1, 1), { id: 'mapa_pilar', x: 1, z: 1, rot: 0 }, { id: 'mapa_pilar', x: 1, z: 1, rot: 0 }]),
        cat,
      ),
    );
    expect(e.motivo).toBe('layout_invalido');
  });

  it('peça fora dos limites gera layout_invalido', () => {
    const e = erro(() => validarMapa(base([spawn, { id: 'mapa_decoracao', x: 20, z: 0, rot: 0 }]), cat));
    expect(e.motivo).toBe('layout_invalido');
  });

  it('mapa sem spawn gera layout_invalido', () => {
    const e = erro(() => validarMapa(base([chao(0, 0)]), cat));
    expect(e.motivo).toBe('layout_invalido');
    expect(e.detalhe).toContain('spawn');
  });

  it('rotação 45 gera layout_invalido', () => {
    const e = erro(() => validarMapa(base([{ id: 'mapa_spawn', x: 0, z: 0, rot: 45 }]), cat));
    expect(e.motivo).toBe('layout_invalido');
  });

  it('mais de 400 peças gera limite_excedido', () => {
    const pecas = Array.from({ length: 401 }, (_, i) => ({ id: 'mapa_decoracao', x: i % 20, z: Math.floor(i / 20) % 20, rot: 0 }));
    pecas[0] = spawn;
    const e = erro(() => validarMapa(base(pecas), cat));
    expect(e.motivo).toBe('limite_excedido');
  });

  it('tamanho acima de 40x40 gera quantidade_invalida', () => {
    const e = erro(() => validarMapa(base([spawn], { largura: 41, comprimento: 20 }), cat));
    expect(e.motivo).toBe('quantidade_invalida');
  });

  it('estrutura sem chão na mesma célula gera layout_invalido', () => {
    const e = erro(() => validarMapa(base([spawn, { id: 'mapa_pilar', x: 5, z: 5, rot: 0 }]), cat));
    expect(e.motivo).toBe('layout_invalido');
    expect(e.detalhe).toContain('chão');
  });

  it('peça desconhecida gera peca_inexistente', () => {
    const e = erro(() => validarMapa(base([spawn, { id: 'mapa_fantasma', x: 0, z: 0, rot: 0 }]), cat));
    expect(e.motivo).toBe('peca_inexistente');
  });

  it('mapa válido gera receita e custo somando uma unidade por peça', () => {
    const r = validarMapa(
      base([chao(5, 5), { id: 'mapa_pilar', x: 5, z: 5, rot: 90 }, spawn, { id: 'mapa_decoracao', x: 2, z: 2, rot: 0 }]),
      cat,
    );
    expect(r.receita.pecas).toHaveLength(4);
    expect(r.custo).toEqual({ metal: 2, madeira: 1 });
  });
});
