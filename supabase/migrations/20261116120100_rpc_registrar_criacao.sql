-- Salva a criação numa única operação transacional (cada chamada de função roda numa transação).
-- O desconto do inventário NÃO acontece aqui: hoje o inventário vem do Roblox, que aplica o custo
-- devolvido pela API. Quando o inventário estiver no Supabase, adicione o débito nesta mesma função.
create or replace function public.registrar_criacao(
  p_jogador_id bigint,
  p_tipo text,
  p_pedido_texto text,
  p_nome text,
  p_pecas jsonb,
  p_layout jsonb,
  p_custo_total jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into criacoes (jogador_id, tipo, pedido_texto, nome, pecas, layout, custo_total)
  values (p_jogador_id, p_tipo, p_pedido_texto, p_nome, p_pecas, p_layout, p_custo_total)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_criacao(bigint, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_criacao(bigint, text, text, text, jsonb, jsonb, jsonb) to service_role;
