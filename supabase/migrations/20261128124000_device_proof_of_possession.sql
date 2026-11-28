-- One-time, owner-scoped challenges for Ed25519 device proof-of-possession.
-- The challenge table is not directly exposed through the Supabase Data API.
create table if not exists public.device_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists device_challenges_owner_expiry_idx
  on public.device_challenges(owner_id, expires_at);

alter table public.device_challenges enable row level security;
revoke all on table public.device_challenges from public, anon, authenticated, service_role;

create or replace function public.issue_device_challenge(
  p_device_id text,
  p_nonce text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_owner_id uuid := auth.uid();
  v_challenge_id uuid;
begin
  if v_owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_nonce !~ '^[A-Za-z0-9_-]{43}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '5 minutes' then
    raise exception 'invalid challenge parameters' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.owner_devices d
    where d.owner_id = v_owner_id
      and d.device_id = p_device_id
      and d.status = 'active'
  ) then
    raise exception 'active device not found' using errcode = 'P0002';
  end if;

  delete from public.device_challenges
  where expires_at < now() - interval '1 day';

  insert into public.device_challenges (owner_id, device_id, nonce, expires_at)
  values (v_owner_id, p_device_id, p_nonce, p_expires_at)
  returning id into v_challenge_id;

  return v_challenge_id;
end;
$$;

create or replace function public.consume_device_challenge(p_challenge_id uuid)
returns table (
  owner_id uuid,
  device_id text,
  nonce text,
  expires_at timestamptz,
  public_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  update public.device_challenges c
  set consumed_at = now()
  from public.owner_devices d
  where c.id = p_challenge_id
    and c.owner_id = auth.uid()
    and c.expires_at > now()
    and c.consumed_at is null
    and d.owner_id = c.owner_id
    and d.device_id = c.device_id
    and d.status = 'active'
  returning c.owner_id, c.device_id, c.nonce, c.expires_at, d.public_key;
end;
$$;

revoke all on function public.issue_device_challenge(text, text, timestamptz) from public, anon;
revoke all on function public.consume_device_challenge(uuid) from public, anon;
grant execute on function public.issue_device_challenge(text, text, timestamptz) to authenticated;
grant execute on function public.consume_device_challenge(uuid) to authenticated;

comment on table public.device_challenges is
  'Short-lived, single-use device proof-of-possession challenges. Direct client access is revoked; owner-bound RPCs issue and atomically consume challenges.';
comment on function public.issue_device_challenge(text, text, timestamptz) is
  'Issues a short-lived challenge only for an active device owned by auth.uid().';
comment on function public.consume_device_challenge(uuid) is
  'Atomically consumes an unexpired, unused challenge for auth.uid() and returns the active device public key for signature verification.';
