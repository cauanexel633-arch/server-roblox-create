# ADR-0001 — Decisões do bootstrap (F0)

Status: aceita · Data: 2026-11-14

## Contexto
O documento mestre exige Fastify compatível com Vercel Functions, autenticação HMAC,
Vercel Cron e nenhum servidor permanente. A F0 entrega o esqueleto verificável; persistência
e fila chegam na F1/F2.

## Decisões

1. **Entrypoint `src/index.ts`.** A documentação da Vercel para Fastify (zero-config) detecta
   `src/index.ts` e transforma a aplicação em uma única Vercel Function (Fluid compute).
   A lógica fica em `apps/api` (`buildApp`), testável via `inject`, sem abrir porta.
   *Não verificado ainda:* deploy real na Vercel (exige o repositório no GitHub conectado).

2. **Imports relativos entre pacotes**, sem aliases de `tsconfig paths`. O bundler da Vercel
   não é garantido de resolver aliases; caminhos relativos funcionam em qualquer ambiente.
   Os `packages/*` mantêm `package.json` próprio para a separação de responsabilidades.

3. **Cron usa GET.** O Vercel Cron invoca a rota com `GET` e `Authorization: Bearer $CRON_SECRET`.
   `/api/internal/process-queue` aceita GET (Cron) e POST (disparo manual), ambos autenticados
   com comparação em tempo constante. A entrada `crons` no `vercel.json` só será adicionada na F2,
   quando existir um processador real — hoje a rota responde 503 autenticado.

4. **Limite do plano Hobby.** Segundo a documentação consultada, crons no plano Hobby rodam no
   máximo uma vez por dia. O processamento contínuo de filas exige plano Pro (ou outro gatilho
   autorizado). Isso afeta a F2 e será tratado lá; a meta de 180 s do documento é uma meta, não garantia.

5. **HMAC fail-closed.** Sem `NonceStore` (anti-replay persistido, F1) a rota `/v1/generate`
   responde 503 em vez de aceitar requisições sem proteção contra replay. O nonce só é consumido
   depois de a assinatura ser válida, evitando que tráfego não autenticado encha o armazenamento.
   Rotação de segredo: `FORGE_HMAC_SECRET_PREVIOUS` é aceito para o mesmo key id.

6. **Erros RFC 9457** (`application/problem+json`) com `trace_id` (ULID). Falhas de autenticação
   retornam 401 genérico; o motivo real só vai para o log.

7. **Região `gru1`** (São Paulo) no `vercel.json` como padrão provisório. Deve coincidir com a
   região do projeto Supabase; ajustar quando o projeto for criado.

8. **Sem `maxDuration` no `vercel.json`.** Declarar `functions` para `src/index.ts` quebra o build
   (a Vercel exige que o padrão case com arquivos em `api/`). O Fastify zero-config usa o limite padrão
   do plano; o ajuste fino fica para a F2, conforme a conta Vercel.

## Limitações conhecidas da F0
- `POST /v1/generate` valida e autentica, mas não cria jobs (503 `not_ready`).
- `/metrics`, SSE, demais endpoints da seção 5.1 e OpenTelemetry ainda não existem.
- Nenhuma integração externa (Supabase, Vercel, OpenRouter) foi exercitada contra serviço real.
