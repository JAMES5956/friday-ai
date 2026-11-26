-- Memory lifecycle controls: sensitivity, provenance, expiry and access timestamps.
-- Existing memories remain owner-visible and retain their current content encryption.
alter table public.memories
  add column if not exists sensitivity text not null default 'internal'
    check (sensitivity in ('routine', 'internal', 'restricted')),
  add column if not exists expires_at timestamptz,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists source_reference text;

create index if not exists memories_owner_expiry_idx
  on public.memories(user_id, expires_at)
  where retained = true;

create or replace function public.set_memory_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memories_updated_at on public.memories;
create trigger memories_updated_at
  before update on public.memories
  for each row execute function public.set_memory_updated_at();

revoke all on function public.set_memory_updated_at() from public;

comment on column public.memories.sensitivity is
  'routine/internal may be included in model context; restricted is owner-only and never sent to AI models.';
comment on column public.memories.source_reference is
  'Optional non-secret provenance reference such as a project ID or source URL; never store credentials here.';
comment on column public.memories.expires_at is
  'Optional expiry. Expired memories remain owner-visible for review but are excluded from model context.';
