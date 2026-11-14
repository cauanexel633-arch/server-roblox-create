# Forge3D Cloud — status de implementação

## Implementado nesta reconstrução

- [x] F0: monorepo enxuto, TypeScript strict, Fastify serverless, OpenAPI e configuração Vercel
- [x] F1 (fundação): schema multi-tenant, tabelas de jobs/stages/nonces/artifacts, RLS e Storage privado
- [x] F2 (fundação): fila pgmq com wrappers SQL, claim limitado, retry e DLQ
- [x] API HMAC-SHA256, timestamp, nonce anti-replay e key ID
- [x] OpenRouter: descoberta de catálogo, allowlist de modelos gratuitos e sem fallback pago
- [x] Geração procedural determinística de geometria de espada em malha triangular
- [x] Exportação binária GLB e OBJ reais, manifesto e SHA-256
- [x] Processamento retomável por Cron com checkpoint de estágio
- [x] Endpoints health, ready, generate, job, cancel e package
- [x] Integração inicial Roblox server-to-server com token em header secreto
- [x] Associação de jobs ao UserId, autorização de status/pacote/cancelamento por jogador e universo
- [x] Limite configurável de solicitações por jogador/hora e proteção de colisão de idempotency key
- [x] Exemplos Luau de interface cliente e controlador no servidor Roblox
- [ ] Teste E2E em experiência Roblox publicada e validação de Experience Secrets

## Parcial / depende de credenciais ou validação externa

- [ ] Integração Supabase real: requer variáveis e migrations aplicadas no projeto do usuário
- [ ] OpenRouter real: requer chave e disponibilidade de modelos gratuitos
- [ ] Cron em produção: depende do projeto Vercel conectado e deployment READY
- [ ] Publicação/importação do GLB/OBJ como asset Roblox: Open Cloud Assets API ou pipeline equivalente ainda não incluído

## Ainda não implementado — não considerar concluído

- [ ] UV unwrap e packing profissional
- [ ] Texturas PBR rasterizadas (Albedo, Normal, ORM, Emissive, AO, Height)
- [ ] Rigging, skinning, IK e animações com keyframes
- [ ] Sistema completo de VFX Roblox
- [ ] Parser/AST Luau completo e sandbox isolado
- [ ] Auditor independente com credencial isolada e assinatura Ed25519
- [ ] Busca web com provedores e licenças configuráveis
- [ ] pgvector, embeddings e biblioteca semântica
- [ ] 15 agentes com eval suites e permissões individualizadas completas
- [ ] Evals, cobertura >=85%, testes cloud e E2E Roblox
- [ ] Open Cloud Assets API e validação de publicação

O próximo passo é provisionar/validar Supabase e Vercel, executar typecheck/testes em CI e implementar as etapas restantes sem substituir funcionalidades reais por mocks.
