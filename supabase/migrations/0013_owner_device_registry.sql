-- Owner-controlled device registry.
-- Public keys are not secrets; private keys must remain on their devices.
-- Revocation is irreversible through the client API and is retained for auditability.
create table if not exists public.owner_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[A-Za-z0-9._:-]{16,128}$'),
  device_name text not null check (char_length(device_name) between 1 and 80),
  platform text not null check (platform in ('android', 'ios', 'web', 'windows', 'macos', 'linux', 'wear_os', 'watchos')),
  public_key text not null check (char_length(public_key) between 32 and 8192),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  unique (owner_id, device_id),
  check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);

create index if not exists owner_devices_owner_status_idx
  on public.owner_devices(owner_id, status, created_at desc);

alter table public.owner_devices enable row level security;
revoke all on public.owner_devices from anon, authenticated;
grant select, insert on public.owner_devices to authenticated;
grant update (status, revoked_at) on public.owner_devices to authenticated;

drop policy if exists "Owners read their registered devices" on public.owner_devices;
drop policy if exists "Owners register their own devices" on public.owner_devices;
drop policy if exists "Owners update their own device records" on public.owner_devices;

create policy "Owners read their registered devices"
  on public.owner_devices for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners register their own devices"
  on public.owner_devices for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners update their own device records"
  on public.owner_devices for update to authenticated
  using ((select auth.uid()) = owner_id and status = 'active')
  with check ((select auth.uid()) = owner_id and status = 'revoked' and revoked_at is not null);

comment on table public.owner_devices is
  'Owner-scoped device inventory. Device registration requires owner MFA; public keys are inventory metadata only until proof-of-possession is implemented. Revocation is retained rather than deleted.';
comment on column public.owner_devices.public_key is
  'Device public key only. The matching private key must remain on the device and must never be uploaded.';
