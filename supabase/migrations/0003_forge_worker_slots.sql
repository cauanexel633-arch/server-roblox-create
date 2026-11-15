create table if not exists public.forge_worker_slots (
  slot_id smallint primary key,
  worker_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint forge_worker_slot_lease_pair check (
    (worker_token is null and lease_until is null) or
    (worker_token is not null and lease_until is not null)
  )
);

insert into public.forge_worker_slots(slot_id)
select slot_id::smallint from generate_series(1, 10) as slot_id
on conflict (slot_id) do nothing;

create unique index if not exists forge_worker_slots_worker_token_unique
  on public.forge_worker_slots(worker_token)
  where worker_token is not null;

alter table public.forge_worker_slots enable row level security;
revoke all on public.forge_worker_slots from anon, authenticated;
grant all on public.forge_worker_slots to service_role;

create or replace function public.forge_acquire_worker(
  p_worker_token uuid,
  p_lease_seconds integer default 120,
  p_max_slots integer default 3
)
returns boolean
language sql
security definer
set search_path = public
as 'with candidate as (
  select slot_id
  from public.forge_worker_slots
  where slot_id <= greatest(1, least(coalesce(p_max_slots, 3), 10))
    and (worker_token is null or lease_until <= now())
  order by slot_id
  for update skip locked
  limit 1
),
claimed as (
  update public.forge_worker_slots slots
  set worker_token = p_worker_token,
      lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300))),
      updated_at = now()
  from candidate
  where slots.slot_id = candidate.slot_id
  returning true as acquired
)
select coalesce((select acquired from claimed limit 1), false)';

create or replace function public.forge_renew_worker(
  p_worker_token uuid,
  p_lease_seconds integer default 120
)
returns boolean
language sql
security definer
set search_path = public
as 'with renewed as (
  update public.forge_worker_slots
  set lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300))),
      updated_at = now()
  where worker_token = p_worker_token and lease_until > now()
  returning true as renewed
)
select coalesce((select renewed from renewed limit 1), false)';

create or replace function public.forge_release_worker(p_worker_token uuid)
returns boolean
language sql
security definer
set search_path = public
as 'with released as (
  update public.forge_worker_slots
  set worker_token = null, lease_until = null, updated_at = now()
  where worker_token = p_worker_token
  returning true as released
)
select coalesce((select released from released limit 1), false)';

revoke all on function public.forge_acquire_worker(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.forge_renew_worker(uuid, integer) from public, anon, authenticated;
revoke all on function public.forge_release_worker(uuid) from public, anon, authenticated;
grant execute on function public.forge_acquire_worker(uuid, integer, integer) to service_role;
grant execute on function public.forge_renew_worker(uuid, integer) to service_role;
grant execute on function public.forge_release_worker(uuid) to service_role;
