-- NEXUS: deduplicated, owner-scoped integrity incident history.
-- Existing audit rows remain unchanged; this migration does not rewrite or apply data.
alter table public.security_audit_events
  add column if not exists event_key text;

alter table public.security_audit_events
  drop constraint if exists security_audit_events_event_key_format_check;
alter table public.security_audit_events
  add constraint security_audit_events_event_key_format_check
  check (event_key is null or (length(event_key) = 64 and event_key !~ '[^a-f0-9]'));

create unique index if not exists security_audit_events_owner_event_key_uidx
  on public.security_audit_events(user_id, event_key)
  where event_key is not null;

comment on column public.security_audit_events.event_key is
  'Optional SHA-256 deduplication key for repeatable NEXUS incident observations; contains no source record content.';
