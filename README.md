# Forge3D Cloud V2

Backend serverless para geração procedural de armas e assets 3D para Roblox. O repositório foi reconstruído para a arquitetura definida no MASTER ENGINEERING PROMPT — FORGE3D CLOUD V2.

## Estado real desta entrega

Esta reconstrução estabelece a fundação executável: API Fastify para Vercel, autenticação HMAC com proteção anti-replay, persistência Supabase, fila baseada em pgmq, processador retomável por Cron, roteador OpenRouter restrito a modelos gratuitos, geração determinística de malha de espada e exportação GLB/OBJ, além de migrations e contratos OpenAPI.

Não declare como concluídos recursos ainda não implementados. Rigging/skinning, UV unwrap/packing, texturas PBR rasterizadas, animações com keyframes, renderização, AST Luau completa, auditoria isolada Ed25519, busca vetorial e publicação Open Cloud são etapas posteriores. Consulte `docs/STATUS.md`.

## Stack

- Node.js 22 + TypeScript strict + Fastify 5
- Vercel Functions + Vercel Cron
- Supabase PostgreSQL, Storage e pgmq
- OpenRouter via SDK OpenAI compatível, filtrando modelos com sufixo `:free`
- Geometria procedural própria, sem Blender, Docker, Python ou executáveis externos

## Rotas

- `POST /v1/generate` — cria job autenticado
- `GET /v1/jobs/:id` — status e progresso
- `POST /v1/jobs/:id/cancel` — cancelamento
- `GET /v1/weapons/:id/package` — manifesto e URLs temporárias
- `GET /health` e `GET /ready`
- `POST /api/internal/process-queue` — Cron protegido

## Configuração

1. Crie um projeto Supabase e configure as variáveis de ambiente da Vercel conforme `.env.example`.
2. Aplique migrations em `supabase/migrations` no SQL Editor do Supabase.
3. A migration cria o bucket privado `packages`. Cadastre cada universo autorizado no SQL Editor: `insert into public.forge_tenants(universe_id,name) values (SEU_UNIVERSE_ID,'Nome do jogo');`.
4. Configure `CRON_SECRET`, `FORGE_HMAC_SECRET` e `OPENROUTER_API_KEY` como variáveis server-side na Vercel.
5. Configure o segredo HMAC correspondente no servidor Roblox. Nunca coloque esse segredo em LocalScript ou ReplicatedStorage.
6. Conecte o repositório à Vercel e faça deploy pela integração Git. O Cron foi deixado em execução diária para compatibilidade conservadora com Hobby; processamento frequente exige plano e configuração de Cron compatíveis, ou disparo autenticado do endpoint pelo servidor do jogo.

## Assinatura HMAC

A assinatura é HMAC-SHA256 de `timestamp.nonce.rawBody`. Cabeçalhos: `X-Forge-Timestamp`, `X-Forge-Nonce`, `X-Forge-Signature`, `X-Forge-Key-Id`. Timestamp tolerado: 30 segundos. Nonces são persistidos no Supabase.

## Desenvolvimento

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

Não é necessário instalar Blender, Docker ou Python. Testes locais são opcionais; produção executa exclusivamente em Vercel Functions.

## Limites

A Vercel não é um worker de longa duração. Cada tick processa quantidade limitada de mensagens e persiste checkpoints. A duração configurada deve respeitar o plano da conta. Os modelos gratuitos do OpenRouter podem sofrer indisponibilidade ou rate limit; o job permanece retomável, sem fallback pago.
