# Integração Roblox — CRIE SEU PVP

Este documento descreve a primeira integração server-to-server entre o jogo Universe **10776153543** e o Forge3D Cloud.

## Fluxo implementado

1. O LocalScript envia somente a descrição ao RemoteEvent \`Forge3DRequest\`.
2. O Script em \`ServerScriptService\` recebe o objeto \`Player\` e obtém \`player.UserId\` no servidor. O cliente não escolhe nem envia o UserId.
3. O servidor chama \`POST /v1/generate\` com \`universe_id\`, \`player.user_id\`, descrição, parâmetros e \`idempotency_key\`.
4. O backend adiciona um prompt-base controlado pelo servidor, valida o universo cadastrado, limita o tamanho da descrição e aplica limite por jogador/hora.
5. O backend associa o jogador ao registro do job dentro de \`forge_jobs.request\`.
6. O servidor consulta status e pacote enviando \`universe_id\` e \`user_id\`. O backend só retorna o job se universo e jogador corresponderem.
7. Ao concluir, o backend devolve URLs temporárias assinadas para GLB, OBJ e manifesto. O servidor Roblox não entrega esses arquivos como Tool diretamente: é necessário um pipeline de importação/publicação como asset Roblox.

## Arquivos Luau

- \`roblox/ServerScriptService/Forge3DServer.server.lua\`: recebe solicitações, autentica no backend, consulta status e obtém pacote.
- \`roblox/StarterPlayer/StarterPlayerScripts/Forge3DClient.client.lua\`: interface de solicitação; não contém segredo nem UserId.
- O Script de servidor cria automaticamente \`Forge3DRequest\` e \`Forge3DStatus\` em ReplicatedStorage.

## Configuração obrigatória

### 1. Vercel

Adicione estas variáveis no projeto Vercel e faça o deploy da branch/PR após revisar:

- \`FORGE_ROBLOX_TOKEN\`: segredo aleatório com pelo menos 32 caracteres.
- \`MAX_PLAYER_JOBS_PER_HOUR\`: opcional; padrão 3.
- Preserve \`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`, \`CRON_SECRET\`, \`FORGE_HMAC_SECRET\` e \`OPENROUTER_API_KEY\` já configuradas.

Não reutilize o HMAC secret como token. Não coloque nenhum desses segredos em LocalScript, ReplicatedStorage, atributos ou resposta remota.

### 2. Supabase

Execute uma vez no SQL Editor a migration \`supabase/migrations/0002_roblox_player_integration.sql\`:

\`\`\`sql
create index if not exists forge_jobs_tenant_created_player
  on public.forge_jobs (tenant_id, created_at desc);
create index if not exists forge_jobs_player_user_id
  on public.forge_jobs ((request #>> '{player,user_id}'), created_at desc);
\`\`\`

O tenant do jogo já deve existir em \`forge_tenants\`:
- Universe ID: \`10776153543\`
- Nome: \`CRIE SEU PVP\`

### 3. Roblox Studio

1. Publique/abra a experiência correta (Universe ID acima).
2. Em **Game Settings → Security**, habilite **Allow HTTP Requests**.
3. Cadastre um Experience Secret com o nome \`FORGE3D_API_TOKEN\` e valor igual ao \`FORGE_ROBLOX_TOKEN\` da Vercel.
4. Configure a lista de domínios permitidos para \`server-roblox-create.vercel.app\`, caso a experiência use a allowlist de domínios.
5. Crie um Script em \`ServerScriptService\` usando \`Forge3DServer.server.lua\`.
6. Crie um LocalScript em \`StarterPlayer → StarterPlayerScripts\` usando \`Forge3DClient.client.lua\`.
7. Teste em servidor publicado, pois chamadas HTTP e Experience Secrets devem ser validados no ambiente da experiência.

O servidor usa \`HttpService:GetSecret("FORGE3D_API_TOKEN")\` no cabeçalho \`x-forge-token\`. O segredo não é convertido para texto nem enviado ao cliente.

## Endpoints e autenticação

Chamadas do servidor Roblox devem incluir \`x-forge-token\`. Chamadas HMAC existentes continuam suportadas.

- \`POST /v1/generate\`
- \`GET /v1/jobs/{job_id}?universe_id=10776153543&user_id={UserId}\`
- \`POST /v1/jobs/{job_id}/cancel?universe_id=...&user_id=...\`
- \`GET /v1/weapons/{job_id}/package?universe_id=...&user_id=...\`
- \`POST /internal/process-queue\` — pode ser acionado pelo servidor autenticado após criar o job; Vercel ainda limita a duração da função.

O identificador do jogador é uma string decimal para evitar perda de precisão numérica. O backend não confia no UserId enviado pelo cliente Roblox; a confiança é no Script de servidor que guarda o Experience Secret. Um token compartilhado comprometido permite chamadas falsas, portanto mantenha-o somente no servidor e faça rotação se houver exposição.

## Limitações reais desta versão

- O gerador atual chama \`createSwordMesh()\` e exporta uma espada procedural. A descrição é interpretada pelo agente, mas ainda não controla a geometria final. Solicitar machado, rifle ou design muito específico não garante esse formato.
- GLB/OBJ não são instâncias Roblox e não podem ser transformados diretamente em Tool por um Script de jogo em runtime.
- O endpoint de pacote devolve links privados assinados de curta duração. Ainda falta importar/publicar o modelo usando uma pipeline compatível com Roblox (por exemplo, upload de asset por ferramenta/pipeline autorizado) e persistir o respectivo asset ID.
- Não são gerados atualmente scripts Luau da arma, animações keyframed, VFX, UV/PBR ou RBXMX.
- O acionamento imediato do worker é best-effort e está sujeito ao limite de execução Vercel. O Cron atual do projeto é diário; para processamento confiável quase em tempo real será necessário um worker/cron com frequência compatível com o plano ou infraestrutura de fila dedicada.
- O exemplo faz polling por até 90 segundos. Se o worker não concluir nesse período, informa que o job continua pendente; não entrega uma arma falsa nem presume que o pacote foi importado.

## Testes

No repositório:

\`\`\`bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
\`\`\`

Depois do deploy autorizado, validar \`/health\`, \`/ready\`, criar um job de teste e confirmar que um UserId diferente recebe \`404 not_found\` ao consultar o job.
