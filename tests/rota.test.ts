import { describe, expect, it } from 'vitest';
import { criarApp } from '../src/app.js';
import { LimitadorJanela } from '../src/ratelimit.js';
import { iaFalsa, repoFalso } from './fixtures.js';

const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
const corpo = { jogador_id: 7, tipo: 'arma', descricao: 'rifle', inventario: { metal: 10 } };

function montar(repo = repoFalso(), ia = iaFalsa(JSON.stringify({ ok: false, motivo: 'x' }))) {
  const app = criarApp({
    tokenEsperado: TOKEN,
    repo,
    ia,
    limitador: new LimitadorJanela(10),
    timeouts: { arma: 8000, mapa: 20000 },
  });
  return { app, repo, ia };
}

describe('POST /pedidos', () => {
  it('sem token responde 401 e não processa nada', async () => {
    const { app, repo, ia } = montar();
    const res = await app.inject({ method: 'POST', url: '/pedidos', payload: corpo });
    expect(res.statusCode).toBe(401);
    expect(ia.chamadas).toHaveLength(0);
    expect(repo.falhas).toHaveLength(0);
  });

  it('descrição vazia responde 400 texto_invalido e grava uma falha', async () => {
    const { app, repo } = montar();
    const res = await app.inject({
      method: 'POST',
      url: '/pedidos',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { ...corpo, descricao: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ ok: false, motivo: 'texto_invalido' });
    expect(repo.falhas).toHaveLength(1);
    expect(repo.falhas[0]!.motivoCodigo).toBe('texto_invalido');
  });

  it('corpo estrutural inválido responde 400 e não grava nada', async () => {
    const { app, repo } = montar();
    const res = await app.inject({
      method: 'POST',
      url: '/pedidos',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { ...corpo, jogador_id: -1 },
    });
    expect(res.statusCode).toBe(400);
    expect(repo.falhas).toHaveLength(0);
  });

  it('pedido processado com falha de negócio responde 200 com ok false', async () => {
    const { app, repo } = montar();
    const res = await app.inject({
      method: 'POST',
      url: '/pedidos',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: corpo,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, motivo: 'pedido_impossivel' });
    expect(repo.falhas).toHaveLength(1);
  });
});
