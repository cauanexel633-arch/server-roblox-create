# Guia de implantação (F0)

Tudo é feito pelo navegador/GitHub; nada é instalado na máquina do desenvolvedor.

1. **GitHub** — envie este repositório para um repositório seu.
2. **Supabase** — crie um projeto (região próxima à da Vercel; o `vercel.json` usa `gru1`).
   Copie `Project URL` e a chave `service_role` (Settings → API). A `service_role` fica **só** na Vercel.
3. **Vercel** — *Add New → Project* → importe o repositório (Git Integration).
   Em *Settings → Environment Variables*, preencha as variáveis **obrigatórias** do `.env.example`:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FORGE_HMAC_KEY_ID`, `FORGE_HMAC_SECRET`, `CRON_SECRET`.
   Gere os segredos com ≥ 32 caracteres aleatórios (ex.: `openssl rand -hex 32`).
4. Após o deploy, `GET /health` deve retornar 200. `GET /ready` retornará 503 até a F1/F2 ligarem
   persistência e fila — esse é o comportamento esperado hoje.
5. **Roblox** — o `FORGE_HMAC_SECRET` deve existir apenas em um Script de servidor (por exemplo via
   `HttpService:RequestAsync` com assinatura calculada no servidor), nunca em LocalScript/ReplicatedStorage.

Assinatura: `HMAC-SHA256(secret, timestamp + "." + nonce + "." + rawBody)` em hexadecimal, com os
headers `X-Forge-Key-Id`, `X-Forge-Timestamp` (epoch em segundos), `X-Forge-Nonce` e `X-Forge-Signature`.

## Dados do projeto
- Repositório: `cauanexel633-arch/server-roblox-create`
- Supabase project ref: `nlvvsjmuttdyrzkbrxwm` → `SUPABASE_URL=https://nlvvsjmuttdyrzkbrxwm.supabase.co`
- As chaves (`SUPABASE_SERVICE_ROLE_KEY`, `FORGE_HMAC_SECRET`, `CRON_SECRET` etc.) são digitadas somente em
  Vercel → Settings → Environment Variables. Nunca são commitadas nem enviadas em conversa.
