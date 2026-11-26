-- NEXUS tamper-evident integrity metadata for owner personal memories.
-- Existing rows remain NULL until explicitly reviewed and sealed by the owner.
alter table public.memories
  add column if not exists integrity_digest text,
  add column if not exists integrity_version smallint,
  add column if not exists integrity_sealed_at timestamptz;

alter table public.memories
  drop constraint if exists memories_integrity_digest_format_check;
alter table public.memories
  add constraint memories_integrity_digest_format_check
  check (integrity_digest is null or integrity_digest ~ '^[a-f0-9]{64}$');

alter table public.memories
  drop constraint if exists memories_integrity_version_check;
alter table public.memories
  add constraint memories_integrity_version_check
  check (
    (integrity_digest is null and integrity_version is null)
    or (integrity_digest is not null and integrity_version = 1)
  );

create index if not exists memories_integrity_review_idx
  on public.memories(user_id, integrity_sealed_at desc)
  where retained = true;

comment on column public.memories.integrity_digest is
  'HMAC-SHA256 over owner ID, memory ID and ciphertext using a domain-separated key derived from FRIDAY_DATA_ENCRYPTION_KEY. NULL means legacy/unsealed, not verified.';
comment on column public.memories.integrity_version is
  'Integrity envelope version. Version 1 uses HMAC-SHA256 with domain separation.';
comment on column public.memories.integrity_sealed_at is
  'Time the owner explicitly sealed this memory after reviewing its legacy content.';

-- Extend the same tamper-evident envelope to specialist, knowledge and project stores.
alter table public.agent_memories
  add column if not exists integrity_digest text,
  add column if not exists integrity_version smallint,
  add column if not exists integrity_sealed_at timestamptz;
alter table public.knowledge_records
  add column if not exists integrity_digest text,
  add column if not exists integrity_version smallint,
  add column if not exists integrity_sealed_at timestamptz;
alter table public.project_records
  add column if not exists integrity_digest text,
  add column if not exists integrity_version smallint,
  add column if not exists integrity_sealed_at timestamptz;

do $$
declare table_name text;
begin
  foreach table_name in array array['agent_memories', 'knowledge_records', 'project_records'] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_integrity_digest_format_check');
    execute format('alter table public.%I add constraint %I check (integrity_digest is null or integrity_digest ~ ''^[a-f0-9]{64}$'')',
      table_name, table_name || '_integrity_digest_format_check');
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_integrity_version_check');
    execute format('alter table public.%I add constraint %I check ((integrity_digest is null and integrity_version is null) or (integrity_digest is not null and integrity_version = 1))',
      table_name, table_name || '_integrity_version_check');
  end loop;
end $$;

comment on column public.agent_memories.integrity_digest is 'HMAC-SHA256 binding owner, record ID and ciphertext with the agent_memory domain.';
comment on column public.knowledge_records.integrity_digest is 'HMAC-SHA256 binding owner, record ID and ciphertext with the knowledge domain.';
comment on column public.project_records.integrity_digest is 'HMAC-SHA256 binding owner, record ID and ciphertext with the project domain.';
