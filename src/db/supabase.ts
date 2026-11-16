import { createClient } from '@supabase/supabase-js';
import type { Peca, Tipo } from '../dominio/tipos.js';
import type { NovaCriacao, NovaFalha, RepositorioPedidos } from '../dominio/processarPedido.js';

// Mensagens de erro são genéricas: detalhes do Supabase podem conter dados internos.
export function criarRepositorioSupabase(url: string, serviceRoleKey: string): RepositorioPedidos {
  const sb = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async carregarPecas(tipo: Tipo): Promise<Peca[]> {
      const { data, error } = await sb
        .from('pecas')
        .select('id, nome, tipo, categoria, custo, propriedades, ativo')
        .eq('tipo', tipo)
        .eq('ativo', true);
      if (error) throw new Error('falha ao carregar peças');
      return (data ?? []) as Peca[];
    },

    async registrarCriacao(c: NovaCriacao): Promise<string> {
      const { data, error } = await sb.rpc('registrar_criacao', {
        p_jogador_id: c.jogadorId,
        p_tipo: c.tipo,
        p_pedido_texto: c.pedidoTexto,
        p_nome: c.nome,
        p_pecas: c.pecas ?? null,
        p_layout: c.layout ?? null,
        p_custo_total: c.custoTotal,
      });
      if (error || typeof data !== 'string') throw new Error('falha ao registrar criação');
      return data;
    },

    async registrarFalha(f: NovaFalha): Promise<void> {
      const { error } = await sb.from('pedidos_falhos').insert({
        jogador_id: f.jogadorId,
        tipo: f.tipo,
        pedido_texto: f.pedidoTexto,
        motivo_codigo: f.motivoCodigo,
        motivo_detalhe: f.motivoDetalhe,
        resposta_ia: f.respostaIA ?? null,
      });
      if (error) throw new Error('falha ao registrar pedido falho');
    },
  };
}
