-- Encrypted, owner-controlled knowledge archive and decision journal.
-- Apply after 0006_memory_lifecycle.sql. No plaintext titles, notes or source metadata.
create table if not exists public.knowledge_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in ('knowledge', 'decision')),
  status text not null default 'active' check (status in ('active', 'superseded', 'archived')),
  sensitivity text not null default 'internal' check (sensitivity in ('routine', 'internal', 'restricted')),
  payload_ciphertext text not null check (char_length(payload_ciphertext) between 1 and 60000),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_records_owner_type_idx
  on public.knowledge_records(owner_id, record_type, status, updated_at desc);
create index if not exists knowledge_records_expiry_idx
  on public.knowledge_records(owner_id, expires_at) where expires_at is not null;
alter table public.knowledge_records enable row level security;
create policy "Owners manage their encrypted knowledge records"
  on public.knowledge_records for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create trigger knowledge_records_updated_at
  before update on public.knowledge_records
  for each row execute function public.set_agent_updated_at();
revoke all on public.knowledge_records from anon;
grant select, insert, update, delete on public.knowledge_records to authenticated;
comment on table public.knowledge_records is
  'Owner-only encrypted archive for verified knowledge and decision history. Payload is encrypted by the application before storage.';