-- FRIDAY AI core schema.
-- Run in the Supabase SQL editor after creating the project.
-- All user-owned data is protected by row-level security.

create extension if not exists pgcrypto;

create table if not exists public.friday_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Boss',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) <= 20000),
  created_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations(user_id, updated_at desc);
create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);
create index if not exists messages_user_created_idx
  on public.messages(user_id, created_at desc);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general',
  content text not null check (char_length(content) <= 20000),
  source text not null default 'owner',
  confidence numeric(4,3) not null default 1.000 check (confidence between 0 and 1),
  retained boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_user_category_idx
  on public.memories(user_id, category, updated_at desc);

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_created_idx
  on public.security_audit_events(created_at desc);

alter table public.friday_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.security_audit_events enable row level security;

create policy "Users can read their own profile"
  on public.friday_profiles for select to authenticated
  using (auth.uid() = user_id);
create policy "Users can update their own profile"
  on public.friday_profiles for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own conversations"
  on public.conversations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own messages"
  on public.messages for all to authenticated
  using (auth.uid() = user_id) with check (
    auth.uid() = user_id and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Users manage their own memories"
  on public.memories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Audit events are append-only for authenticated users.
create policy "Users can read their own security events"
  on public.security_audit_events for select to authenticated
  using (auth.uid() = user_id);
create policy "Users can append their own security events"
  on public.security_audit_events for insert to authenticated
  with check (auth.uid() = user_id);

-- Create the default FRIDAY profile automatically when an auth user is added.
create or replace function public.handle_new_friday_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.friday_profiles(user_id, display_name)
  values (new.id, 'Boss')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_friday_auth_user_created on auth.users;
create trigger on_friday_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_friday_user();

-- Backfill profiles for accounts created before this migration was applied.
insert into public.friday_profiles(user_id, display_name)
select id, 'Boss' from auth.users
on conflict (user_id) do nothing;
