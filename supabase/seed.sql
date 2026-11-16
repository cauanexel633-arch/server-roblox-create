-- Seed inicial do catálogo. Execute após as migrações. Idempotente (on conflict do nothing).
insert into pecas (id, nome, tipo, categoria, custo, propriedades) values
  -- Armas (base, cano, efeito)
  ('arma_pistola',            'Pistola',            'arma', 'base',    '{"metal": 4, "madeira": 1}', '{"dano": 10}'),
  ('arma_rifle',              'Rifle',              'arma', 'base',    '{"metal": 6, "madeira": 3}', '{"dano": 14}'),
  ('arma_cano_curto',         'Cano curto',         'arma', 'cano',    '{"metal": 2}',               '{"alcance": 10}'),
  ('arma_cano_longo',         'Cano longo',         'arma', 'cano',    '{"metal": 4, "polvora": 1}', '{"alcance": 30}'),
  ('arma_efeito_incendiario', 'Efeito incendiário', 'arma', 'efeito',  '{"polvora": 2}',             '{"dano_extra": 5}'),
  -- Projéteis
  ('proj_bala_metal',         'Bala de metal',      'arma', 'projetil', '{"metal": 1, "polvora": 1}', '{"dano": 5, "ocupa": 1, "empilhavel": true}'),
  ('proj_flecha_madeira',     'Flecha de madeira',  'arma', 'projetil', '{"madeira": 1}',             '{"dano": 4, "ocupa": 1, "empilhavel": true}'),
  ('proj_dardo_carne',        'Dardo de carne',     'arma', 'projetil', '{"carne": 1, "madeira": 1}', '{"dano": 3, "ocupa": 1, "empilhavel": true}'),
  -- Mapa (chão, estrutura, spawn, decoração)
  ('mapa_chao_terra',         'Chão de terra',      'mapa', 'chao',       '{}',              '{"empilhavel": true}'),
  ('mapa_pilar_pedra',        'Pilar de pedra',     'mapa', 'estrutura',  '{"metal": 2}',    '{"empilhavel": false}'),
  ('mapa_parede_madeira',     'Parede de madeira',  'mapa', 'estrutura',  '{"madeira": 2}',  '{"empilhavel": false}'),
  ('mapa_ponte_madeira',      'Ponte de madeira',   'mapa', 'estrutura',  '{"madeira": 3}',  '{"empilhavel": false}'),
  ('mapa_spawn',              'Ponto de spawn',     'mapa', 'spawn',      '{}',              '{"empilhavel": true}'),
  ('mapa_decoracao_arvore',   'Árvore decorativa',  'mapa', 'decoracao',  '{"madeira": 1}',  '{"empilhavel": true}')
on conflict (id) do nothing;
