# criador-backend

Servidor HTTP que recebe pedidos do jogo Roblox, interpreta a descrição com um modelo de IA (OpenRouter) e devolve uma receita validada de arma ou mapa. Sucessos vão para `criacoes`; falhas vão para `pedidos_falhos` com o motivo.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm run dev            # servidor em watch mode
npm test               # testes (provedor de IA falso, sem chamadas reais)
npm run build && npm start
```

## Aplicar migrações no Supabase

Opção A, pelo SQL Editor: execute na ordem os arquivos
1. `supabase/migrations/20261116120000_schema_inicial.sql`
2. `supabase/migrations/20261116120100_rpc_registrar_criacao.sql`
3. `supabase/seed.sql` (opcional, catálogo inicial)

Opção B, com a Supabase CLI: `supabase db push` (o diretório `supabase/migrations/` é o padrão).

## Exemplos de requisição

Arma:
```bash
curl -X POST http://localhost:3000/pedidos \
  -H "Authorization: Bearer $GAME_SHARED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jogador_id":123,"tipo":"arma","descricao":"uma pistola com balas de metal","inventario":{"metal":10,"madeira":5,"polvora":4}}'
```

Mapa:
```bash
curl -X POST http://localhost:3000/pedidos \
  -H "Authorization: Bearer $GAME_SHARED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jogador_id":123,"tipo":"mapa","descricao":"uma pequena arena com um pilar no centro e spawn","inventario":{"metal":10,"madeira":20}}'
```

Respostas: `200` com `{"ok":true,...}` para sucesso ou falha de negócio; `400` para entrada inválida; `401` sem token correto; `500` apenas para erro interno.

## Custo e inventário

O backend calcula o `custo` e devolve no sucesso. O desconto do inventário ainda não é feito pelo servidor, porque o inventário não está no Supabase. Por isso, o Roblox aplica o custo devolvido. Quando o inventário for migrado para o banco, adicione o débito dentro da função `registrar_criacao`.

## Estrutura

```
src/
  server.ts            bootstrap
  app.ts               Fastify + tratamento de erros
  routes/pedidos.ts    POST /pedidos
  auth.ts              token em tempo constante
  ratelimit.ts         limitador em memória (interface plugável)
  config.ts            variáveis de ambiente (Zod)
  db/supabase.ts       repositório Supabase
  ia/provedor.ts       provedor OpenRouter com timeout
  ia/prompts.ts        templates de prompt de arma e mapa
  dominio/             lógica pura: schemas, validarArma, validarMapa, custo, processarPedido
supabase/migrations/   schema e rpc
supabase/seed.sql      catálogo inicial
tests/                 Vitest
```
