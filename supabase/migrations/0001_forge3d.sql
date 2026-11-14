create extension if not exists pgcrypto;
create extension if not exists pgmq;
create table if not exists public.forge_tenants (
  id uuid primary key default gen_random_uuid(), universe_id bigint unique not null,
  name text not null default 'Roblox Universe', settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.forge_jobs (
  id uuid primary key, tenant_id uuid not null references public.forge_tenants(id) on delete cascade,
  status text not null check (status in ('queued','processing','completed','failed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_stage text not null default 'S1', request jsonb not null, result jsonb,
  idempotency_key uuid not null, attempts integer not null default 0, last_error text, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  completed_at timestamptz, unique(tenant_id,idempotency_key)
);
create index if not exists forge_jobs_tenant_created on public.forge_jobs(tenant_id,created_at desc);
create table if not exists public.forge_job_stages (
  id bigserial primary key, job_id uuid not null references public.forge_jobs(id) on delete cascade,
  tenant_id uuid not null references public.forge_tenants(id) on delete cascade,
  stage text not null, status text not null, input jsonb, output jsonb, completed_at timestamptz,
  unique(job_id,stage)
);
create table if not exists public.forge_nonces (
  nonce text primary key, key_id text not null, expires_at timestamptz not null
);
create index if not exists forge_nonces_expiry on public.forge_nonces(expires_at);
create table if not exists public.forge_artifacts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.forge_tenants(id) on delete cascade,
  job_id uuid not null references public.forge_jobs(id) on delete cascade, kind text not null,
  storage_path text not null, sha256 text not null, created_at timestamptz not null default now(),
  unique(job_id,kind)
);
select pgmq.create('forge_jobs');
select pgmq.create('forge_jobs_dlq');
create or replace function public.forge_enqueue_job(p_job_id uuid,p_tenant_id uuid)
returns bigint language plpgsql security definer set search_path=public,pgmq as $$
declare v_msg bigint;
begin v_msg := pgmq.send('forge_jobs', jsonb_build_object('job_id',p_job_id,'tenant_id',p_tenant_id)); return v_msg; end; $$;
create or replace function public.forge_claim_jobs(p_qty integer default 1,p_visibility_seconds integer default 90)
returns table(msg_id bigint,message jsonb) language sql security definer set search_path=public,pgmq as $$
  select r.msg_id,r.message from pgmq.read('forge_jobs',p_visibility_seconds,p_qty) r;
$$;
create or replace function public.forge_ack_job(p_msg_id bigint)
returns boolean language sql security definer set search_path=public,pgmq as $$ select pgmq.delete('forge_jobs',p_msg_id); $$;
create or replace function public.forge_retry_job(p_msg_id bigint,p_delay_seconds integer default 30)
returns void language sql security definer set search_path=public,pgmq as $$ select pgmq.set_vt('forge_jobs',p_msg_id,p_delay_seconds); $$;
create or replace function public.forge_dlq_job(p_msg_id bigint,p_job_id uuid,p_tenant_id uuid,p_error text)
returns bigint language plpgsql security definer set search_path=public,pgmq as $$
declare v_msg bigint;
begin
  v_msg := pgmq.send('forge_jobs_dlq',jsonb_build_object('job_id',p_job_id,'tenant_id',p_tenant_id,'error',left(p_error,500)));
  perform pgmq.delete('forge_jobs',p_msg_id);
  return v_msg;
end; $$;
alter table public.forge_tenants enable row level security;
alter table public.forge_jobs enable row level security;
alter table public.forge_job_stages enable row level security;
alter table public.forge_nonces enable row level security;
alter table public.forge_artifacts enable row level security;
revoke all on public.forge_nonces from anon,authenticated;
revoke all on public.forge_jobs,public.forge_job_stages,public.forge_artifacts,public.forge_tenants from anon,authenticated;
grant all on public.forge_nonces,public.forge_jobs,public.forge_job_stages,public.forge_artifacts,public.forge_tenants to service_role;
revoke execute on function public.forge_enqueue_job(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.forge_claim_jobs(integer,integer) from public,anon,authenticated;
revoke execute on function public.forge_ack_job(bigint) from public,anon,authenticated;
revoke execute on function public.forge_retry_job(bigint,integer) from public,anon,authenticated;
revoke execute on function public.forge_dlq_job(bigint,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.forge_enqueue_job(uuid,uuid) to service_role;
grant execute on function public.forge_claim_jobs(integer,integer) to service_role;
grant execute on function public.forge_ack_job(bigint) to service_role;
grant execute on function public.forge_retry_job(bigint,integer) to service_role;
grant execute on function public.forge_dlq_job(bigint,uuid,uuid,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit)
values ('packages','packages',false,52428800) on conflict(id) do nothing;
create or replace function public.forge_cleanup_nonces()
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin delete from public.forge_nonces where expires_at < now(); get diagnostics n = row_count; return n; end; $$;
-- Provisionar cada jogo autorizado antes de usar a API:
-- insert into public.forge_tenants(universe_id,name) values (123456789,'Meu jogo Roblox');
