-- One-time, owner-scoped challenges for Ed25519 device proof-of-possession.
-- Challenge rows are visible only to their owner; only the consumed_at column is mutable.
create table if not exists public.device_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint device_challenges_owner_device_fk
    foreign key (owner_id, device_id)
    references public.owner_devices(owner_id, device_id)
    on delete cascade,
  check (expires_at > created_at)
);

create index if not exists device_challenges_owner_expiry_idx
  on public.device_challenges(owner_id, expires_at);

alter table public.device_challenges enable row level security;
revoke all on table public.device_challenges from public, anon, authenticated, service_role;
grant select on table public.device_challenges to authenticated;
grant insert (owner_id, device_id, nonce, expires_at) on table public.device_challenges to authenticated;
grant update (consumed_at) on table public.device_challenges to authenticated;\ngrant delete on table public.device_challenges to authenticated;

drop policy if exists "Owners read their own device challenges" on public.device_challenges;
drop policy if exists "Owners issue challenges for active devices" on public.device_challenges;
drop policy if exists "Owners consume their own challenges once" on public.device_challenges;\ndrop policy if exists "Owners clean up expired challenges" on public.device_challenges;

create policy "Owners read their own device challenges"
  on public.device_challenges for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners issue challenges for active devices"
  on public.device_challenges for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.owner_devices d
      where d.owner_id = (select auth.uid())
        and d.device_id = device_challenges.device_id
        and d.status = 'active'
    )
  );

create policy "Owners consume their own challenges once"
  on public.device_challenges for update to authenticated
  using (
    (select auth.uid()) = owner_id
    and consumed_at is null
    and expires_at > now()
  )
  with check (
    (select auth.uid()) = owner_id
    and consumed_at is not null
  );

create policy "Owners clean up expired challenges"
  on public.device_challenges for delete to authenticated
  using (
    (select auth.uid()) = owner_id
    and expires_at <= now()
  );

comment on table public.device_challenges is
  'Short-lived, single-use device proof-of-possession challenges. RLS binds every row to its owner and active registered device; clients can only set consumed_at once.';
comment on column public.device_challenges.nonce is
  'Random 256-bit challenge nonce. It is not a secret and must be signed with the device private key.';
