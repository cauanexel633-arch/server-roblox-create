create table if not exists pecas (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('arma', 'mapa')),
  categoria text not null,              -- arma: 'base' | 'cano' | 'projetil' | 'efeito'; mapa: 'chao' | 'estrutura' | 'spawn' | 'decoracao'
  custo jsonb not null default '{}',
  propriedades jsonb not null default '{}',  -- ex.: {"dano": 10} ou {"ocupa": 1, "empilhavel": false}
  ativo boolean not null default true
);

create table if not exists criacoes (
  id uuid primary key default gen_random_uuid(),
  jogador_id bigint not null,
  tipo text not null check (tipo in ('arma', 'mapa')),
  pedido_texto text not null,
  nome text not null,
  pecas jsonb,                          -- usado por armas
  layout jsonb,                         -- usado por mapas
  custo_total jsonb not null default '{}',
  publico boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists pedidos_falhos (
  id uuid primary key default gen_random_uuid(),
  jogador_id bigint,
  tipo text not null check (tipo in ('arma', 'mapa')),
  pedido_texto text,
  motivo_codigo text not null,
  motivo_detalhe text,
  resposta_ia jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists criacoes_jogador_id_idx on criacoes (jogador_id);
create index if not exists criacoes_tipo_publico_idx on criacoes (tipo, publico);
create index if not exists pedidos_falhos_motivo_criado_idx on pedidos_falhos (motivo_codigo, criado_em);

-- RLS ativo, sem políticas públicas: só a service_role (backend) acessa.
alter table pecas enable row level security;
alter table criacoes enable row level security;
alter table pedidos_falhos enable row level security;
