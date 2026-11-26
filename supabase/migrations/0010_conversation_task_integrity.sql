-- NEXUS record-bound integrity for encrypted conversations and specialist work.
-- Existing rows remain unsigned and are reported as legacy until explicitly reviewed.
alter table public.messages add column if not exists integrity_digest text, add column if not exists integrity_version smallint;
alter table public.agent_tasks add column if not exists task_integrity_digest text, add column if not exists task_integrity_version smallint, add column if not exists result_integrity_digest text, add column if not exists result_integrity_version smallint;
alter table public.agent_task_events add column if not exists details_integrity_digest text, add column if not exists details_integrity_version smallint;

alter table public.messages drop constraint if exists messages_integrity_digest_format_check;
alter table public.messages add constraint messages_integrity_digest_format_check check (integrity_digest is null or integrity_digest ~ '^[a-f0-9]{64}$');
alter table public.messages drop constraint if exists messages_integrity_version_check;
alter table public.messages add constraint messages_integrity_version_check check ((integrity_digest is null and integrity_version is null) or (integrity_digest is not null and integrity_version = 1));

alter table public.agent_tasks drop constraint if exists agent_tasks_task_integrity_check;
alter table public.agent_tasks add constraint agent_tasks_task_integrity_check check ((task_integrity_digest is null and task_integrity_version is null) or (task_integrity_digest is not null and task_integrity_digest ~ '^[a-f0-9]{64});
alter table public.agent_tasks drop constraint if exists agent_tasks_result_integrity_check;
alter table public.agent_tasks add constraint agent_tasks_result_integrity_check check ((result_ciphertext is null and result_integrity_digest is null and result_integrity_version is null) or (result_ciphertext is not null and result_integrity_digest is not null and result_integrity_digest ~ '^[a-f0-9]{64});

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest is not null and details_integrity_digest ~ '^[a-f0-9]{64});

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and task_integrity_version = 1));
alter table public.agent_tasks drop constraint if exists agent_tasks_result_integrity_check;
alter table public.agent_tasks add constraint agent_tasks_result_integrity_check check ((result_ciphertext is null and result_integrity_digest is null and result_integrity_version is null) or (result_ciphertext is not null and result_integrity_digest ~ '^[a-f0-9]{64}$' and result_integrity_version = 1));

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest ~ '^[a-f0-9]{64}$' and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and result_integrity_version = 1));

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest ~ '^[a-f0-9]{64}$' and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and task_integrity_version = 1));
alter table public.agent_tasks drop constraint if exists agent_tasks_result_integrity_check;
alter table public.agent_tasks add constraint agent_tasks_result_integrity_check check ((result_ciphertext is null and result_integrity_digest is null and result_integrity_version is null) or (result_ciphertext is not null and result_integrity_digest ~ '^[a-f0-9]{64}$' and result_integrity_version = 1));

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest ~ '^[a-f0-9]{64}$' and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and task_integrity_version = 1));
alter table public.agent_tasks drop constraint if exists agent_tasks_result_integrity_check;
alter table public.agent_tasks add constraint agent_tasks_result_integrity_check check ((result_ciphertext is null and result_integrity_digest is null and result_integrity_version is null) or (result_ciphertext is not null and result_integrity_digest ~ '^[a-f0-9]{64}$' and result_integrity_version = 1));

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest ~ '^[a-f0-9]{64}$' and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and result_integrity_version = 1));

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest ~ '^[a-f0-9]{64}$' and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
 and task_integrity_version = 1));
alter table public.agent_tasks drop constraint if exists agent_tasks_result_integrity_check;
alter table public.agent_tasks add constraint agent_tasks_result_integrity_check check ((result_ciphertext is null and result_integrity_digest is null and result_integrity_version is null) or (result_ciphertext is not null and result_integrity_digest ~ '^[a-f0-9]{64}$' and result_integrity_version = 1));

alter table public.agent_task_events drop constraint if exists agent_task_events_details_integrity_check;
alter table public.agent_task_events add constraint agent_task_events_details_integrity_check check ((details_ciphertext is null and details_integrity_digest is null and details_integrity_version is null) or (details_ciphertext is not null and details_integrity_digest ~ '^[a-f0-9]{64}$' and details_integrity_version = 1));

create index if not exists messages_integrity_review_idx on public.messages(user_id, created_at desc) where integrity_digest is null;
create index if not exists agent_tasks_integrity_review_idx on public.agent_tasks(owner_id, created_at desc) where task_integrity_digest is null;
create index if not exists agent_task_events_integrity_review_idx on public.agent_task_events(owner_id, created_at desc) where details_ciphertext is not null and details_integrity_digest is null;

comment on column public.messages.integrity_digest is 'HMAC-SHA256 binding owner, message ID and encrypted content; NULL means legacy/unsealed.';
comment on column public.agent_tasks.task_integrity_digest is 'HMAC-SHA256 binding owner, task ID and task ciphertext.';
comment on column public.agent_tasks.result_integrity_digest is 'HMAC-SHA256 binding owner, task ID and result ciphertext.';
comment on column public.agent_task_events.details_integrity_digest is 'HMAC-SHA256 binding owner, event ID and encrypted event details.';
