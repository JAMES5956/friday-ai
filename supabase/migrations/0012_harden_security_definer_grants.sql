-- Tighten execution privileges for SECURITY DEFINER functions.
-- The rate limiter is callable only by authenticated owner sessions.
-- The auth-user trigger function is invoked by its trigger, not as an RPC.
revoke all on function public.consume_rate_limit(integer)
  from public, anon, service_role;
grant execute on function public.consume_rate_limit(integer)
  to authenticated;

revoke all on function public.handle_new_friday_user()
  from public, anon, authenticated, service_role;

-- The limiter writes its private counter table as the function owner.
-- API clients must use the guarded RPC and must not read or mutate counters directly.
revoke all on table public.rate_limit_counters from public, anon, authenticated, service_role;
