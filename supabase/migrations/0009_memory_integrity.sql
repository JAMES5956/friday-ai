-- NEXUS tamper-evident integrity metadata for owner personal memories.
-- Existing rows remain NULL until explicitly reviewed and sealed by the owner.
alter table public.memories
  add column if not exists integrity_digest text,
  add column if not exists integrity_version smallint,
  add column if not exists integrity_checked_at timestamptz;

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
  on public.memories(user_id, integrity_checked_at desc)
  where retained = true;

comment on column public.memories.integrity_digest is
  'HMAC-SHA256 over owner ID, memory ID and ciphertext using a domain-separated key derived from FRIDAY_DATA_ENCRYPTION_KEY. NULL means legacy/unsealed, not verified.';
comment on column public.memories.integrity_version is
  'Integrity envelope version. Version 1 uses HMAC-SHA256 with domain separation.';
comment on column public.memories.integrity_checked_at is
  'Last time NEXUS integrity verification examined this memory. Does not imply that a legacy unsigned record is verified.';
