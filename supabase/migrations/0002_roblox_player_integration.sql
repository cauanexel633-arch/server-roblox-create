-- Player-scoped job lookup and hourly quota support.
-- Existing forge_jobs.request JSON already stores player.user_id; no destructive schema change.
create index if not exists forge_jobs_tenant_created_player
  on public.forge_jobs (tenant_id, created_at desc);
create index if not exists forge_jobs_player_user_id
  on public.forge_jobs ((request #>> '{player,user_id}'), created_at desc);
