-- Explicit owner approval gate for sensitive delegated tasks.
-- Apply after 0003_agent_workspaces.sql.
alter table public.agent_tasks
  drop constraint if exists agent_tasks_status_check;

alter table public.agent_tasks
  add constraint agent_tasks_status_check
  check (status in ('awaiting_approval', 'queued', 'assigned', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled'));

alter table public.agent_tasks
  add column if not exists owner_approved_at timestamptz,
  add column if not exists owner_approved_by uuid references auth.users(id) on delete set null;

create index if not exists agent_tasks_approval_idx
  on public.agent_tasks(owner_id, status, created_at desc)
  where status = 'awaiting_approval';
