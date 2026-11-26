-- Enforce specialist memory-sharing boundaries in PostgreSQL as well as the API.
-- Run after 0004_task_approval_workflow.sql.
-- NEXUS remains an isolated security authority; FRIDAY remains the central orchestrator.
create or replace function public.enforce_agent_memory_grant()
returns trigger language plpgsql set search_path = public as $$
declare source_owner uuid; source_agent text; source_sensitivity text;
begin
  if new.from_agent_id in ('friday','nexus') or new.to_agent_id in ('friday','nexus') then
    raise exception 'FRIDAY and NEXUS memory cannot be shared through specialist grants' using errcode='23514';
  end if;
  if new.from_agent_id = new.to_agent_id then
    raise exception 'An agent cannot share memory with itself' using errcode='23514';
  end if;
  if new.expires_at is null or new.expires_at <= now() or new.expires_at > now() + interval '365 days' then
    raise exception 'Memory grants must expire within 365 days' using errcode='23514';
  end if;
  select owner_id,agent_id,sensitivity into source_owner,source_agent,source_sensitivity
    from public.agent_memories where id=new.memory_id;
  if not found or source_owner is distinct from new.owner_id or source_agent is distinct from new.from_agent_id then
    raise exception 'Memory grant source does not match its owner and agent' using errcode='23503';
  end if;
  if source_sensitivity='restricted' then
    raise exception 'Restricted memories cannot be shared' using errcode='23514';
  end if;
  return new;
end; $$;
drop trigger if exists enforce_agent_memory_grant_before_write on public.agent_memory_grants;
create trigger enforce_agent_memory_grant_before_write
  before insert or update of owner_id,memory_id,from_agent_id,to_agent_id,expires_at
  on public.agent_memory_grants for each row execute function public.enforce_agent_memory_grant();
revoke all on function public.enforce_agent_memory_grant() from public;
-- Retain the strongest existing active grant if historical duplicates exist.
-- Prefer the grant with the latest expiry, then the most recently approved.
with ranked_active_grants as (
  select id,
         row_number() over (
           partition by owner_id, memory_id, to_agent_id
           order by expires_at desc nulls last, approved_at desc, id
         ) as duplicate_rank
  from public.agent_memory_grants
  where revoked_at is null
)
update public.agent_memory_grants g
set revoked_at = now()
from ranked_active_grants r
where g.id = r.id and r.duplicate_rank > 1;

create unique index if not exists agent_memory_grants_one_active_pair
  on public.agent_memory_grants(owner_id,memory_id,to_agent_id) where revoked_at is null;
