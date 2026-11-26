-- Owner-controlled project continuity records.
-- Project titles, plans, milestones, tasks, updates and blockers are encrypted
-- together by the application before storage. Apply after 0007_knowledge_decision_archive.sql.
create table if not exists public.project_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload_ciphertext text not null check (char_length(payload_ciphertext) between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_records_owner_updated_idx
  on public.project_records(owner_id, updated_at desc);

alter table public.project_records enable row level security;
revoke all on public.project_records from anon, authenticated;
grant select, insert, update on public.project_records to authenticated;

create policy "Owners read their project records"
  on public.project_records for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners create their project records"
  on public.project_records for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners update their project records"
  on public.project_records for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners delete their project records"
  on public.project_records for delete to authenticated
  using ((select auth.uid()) = owner_id);

create trigger project_records_updated_at
  before update on public.project_records
  for each row execute function public.set_agent_updated_at();

comment on table public.project_records is
  'Owner-only encrypted project continuity records. All project content is application-encrypted before database storage.';
