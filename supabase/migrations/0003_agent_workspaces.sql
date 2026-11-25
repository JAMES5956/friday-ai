-- FRIDAY specialist-agent workspaces.
-- Run after 0001_friday_core.sql and 0002_nexus_rate_limits.sql.
-- Each agent gets a separate owner-scoped workspace and encrypted memory.
-- Cross-agent sharing is represented by explicit, owner-managed grants.
-- This migration creates storage only; no autonomous agent execution is enabled.

create table if not exists public.agent_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null check (agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, agent_id)
);

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null check (agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  memory_type text not null default 'working' check (memory_type in ('working', 'project', 'reference', 'preference')),
  content_ciphertext text not null check (char_length(content_ciphertext) between 1 and 40000),
  source_agent_id text not null check (source_agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  sensitivity text not null default 'internal' check (sensitivity in ('routine', 'internal', 'restricted')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_memories_owner_agent_idx
  on public.agent_memories(owner_id, agent_id, updated_at desc);
create index if not exists agent_memories_expiry_idx
  on public.agent_memories(expires_at)
  where expires_at is not null;

create table if not exists public.agent_memory_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.agent_memories(id) on delete cascade,
  from_agent_id text not null check (from_agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  to_agent_id text not null check (to_agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  approved_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (from_agent_id <> to_agent_id)
);

create index if not exists agent_memory_grants_active_idx
  on public.agent_memory_grants(owner_id, to_agent_id, expires_at)
  where revoked_at is null;

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assigned_agent_id text not null check (assigned_agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  created_by_agent_id text not null default 'friday' check (created_by_agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'queued' check (status in ('queued', 'assigned', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled')),
  task_ciphertext text not null check (char_length(task_ciphertext) between 1 and 40000),
  result_ciphertext text check (result_ciphertext is null or char_length(result_ciphertext) <= 40000),
  requires_owner_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_tasks_owner_status_idx
  on public.agent_tasks(owner_id, status, created_at desc);
create index if not exists agent_tasks_assignee_idx
  on public.agent_tasks(owner_id, assigned_agent_id, status, updated_at desc);

create table if not exists public.agent_task_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  actor_agent_id text not null check (actor_agent_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
  event_type text not null check (char_length(event_type) between 1 and 80),
  details_ciphertext text check (details_ciphertext is null or char_length(details_ciphertext) <= 20000),
  created_at timestamptz not null default now()
);

create index if not exists agent_task_events_task_created_idx
  on public.agent_task_events(owner_id, task_id, created_at);

create or replace function public.set_agent_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_workspaces_updated_at on public.agent_workspaces;
create trigger agent_workspaces_updated_at
  before update on public.agent_workspaces
  for each row execute function public.set_agent_updated_at();

drop trigger if exists agent_memories_updated_at on public.agent_memories;
create trigger agent_memories_updated_at
  before update on public.agent_memories
  for each row execute function public.set_agent_updated_at();

drop trigger if exists agent_tasks_updated_at on public.agent_tasks;
create trigger agent_tasks_updated_at
  before update on public.agent_tasks
  for each row execute function public.set_agent_updated_at();

alter table public.agent_workspaces enable row level security;
alter table public.agent_memories enable row level security;
alter table public.agent_memory_grants enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_task_events enable row level security;

create policy "Owners manage their agent workspaces"
  on public.agent_workspaces for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Owners manage their agent memories"
  on public.agent_memories for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Owners manage agent memory grants"
  on public.agent_memory_grants for all to authenticated
  using (
    auth.uid() = owner_id
    and exists (
      select 1 from public.agent_memories m
      where m.id = memory_id and m.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.agent_memories m
      where m.id = memory_id and m.owner_id = auth.uid()
    )
  );

create policy "Owners manage their agent tasks"
  on public.agent_tasks for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Task events are append-only from authenticated clients.
create policy "Owners read their agent task events"
  on public.agent_task_events for select to authenticated
  using (auth.uid() = owner_id);

create policy "Owners append their agent task events"
  on public.agent_task_events for insert to authenticated
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.agent_tasks t
      where t.id = task_id and t.owner_id = auth.uid()
    )
  );

revoke all on function public.set_agent_updated_at() from public;
