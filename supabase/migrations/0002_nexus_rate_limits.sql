-- NEXUS foundation: database-backed per-owner request throttling.
-- Run after 0001_friday_core.sql.

create table if not exists public.rate_limit_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, window_start)
);

alter table public.rate_limit_counters enable row level security;
-- No direct table policies: clients can only consume limits through the function.

create or replace function public.consume_rate_limit(p_limit integer default 15)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_window timestamptz := date_trunc('minute', now());
  current_count integer;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 15), 60));
begin
  if current_user_id is null then
    return false;
  end if;

  insert into public.rate_limit_counters(user_id, window_start, request_count)
  values (current_user_id, current_window, 1)
  on conflict (user_id, window_start)
  do update set request_count = public.rate_limit_counters.request_count + 1
  returning request_count into current_count;

  delete from public.rate_limit_counters
  where window_start < now() - interval '2 hours';

  return current_count <= safe_limit;
end;
$$;

revoke all on function public.consume_rate_limit(integer) from public;
grant execute on function public.consume_rate_limit(integer) to authenticated;
