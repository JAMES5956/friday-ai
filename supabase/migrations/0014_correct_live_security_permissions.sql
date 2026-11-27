-- Correct the live permissions and owner-device revocation rules.
-- Safe to re-run: grants are reset and the policies are recreated.
-- No application rows are deleted or modified.

-- Rate-limit counters are private implementation state. Only the function owner
-- accesses them; clients must call the guarded SECURITY DEFINER RPC.
revoke all privileges on table public.rate_limit_counters
  from public, anon, authenticated, service_role;
revoke all privileges (user_id, window_start, request_count)
  on table public.rate_limit_counters
  from public, anon, authenticated, service_role;

-- Remove all direct client privileges, including any column-level grants.
revoke all privileges on table public.owner_devices
  from public, anon, authenticated;
revoke all privileges (id, owner_id, device_id, device_name, platform, public_key, status, created_at, last_seen_at, revoked_at)
  on table public.owner_devices
  from public, anon, authenticated;

-- Owners can inspect their own devices and register active devices.
-- Initial registration cannot forge a revoked state or lifecycle timestamps.
grant select on table public.owner_devices to authenticated;
grant insert (owner_id, device_id, device_name, platform, public_key)
  on table public.owner_devices to authenticated;

-- A device can only transition from active to revoked. No client UPDATE
-- permission exists for identity, key, platform, ownership, or timestamps
-- other than the revocation timestamp.
grant update (status, revoked_at) on table public.owner_devices to authenticated;

drop policy if exists "Owners read their registered devices" on public.owner_devices;
drop policy if exists "Owners register their own devices" on public.owner_devices;
drop policy if exists "Owners update their own device records" on public.owner_devices;

create policy "Owners read their registered devices"
  on public.owner_devices for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners register their own active devices"
  on public.owner_devices for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and status = 'active'
    and revoked_at is null
  );

create policy "Owners revoke their active devices"
  on public.owner_devices for update to authenticated
  using (
    (select auth.uid()) = owner_id
    and status = 'active'
    and revoked_at is null
  )
  with check (
    (select auth.uid()) = owner_id
    and status = 'revoked'
    and revoked_at is not null
  );

comment on table public.rate_limit_counters is
  'Private rate-limit state. Direct API role privileges are revoked; access is through the guarded consume_rate_limit function.';
comment on table public.owner_devices is
  'Owner-scoped device inventory. Authenticated owners may register, read, and irreversibly revoke their own devices. Public keys are inventory metadata until proof-of-possession is implemented.';
