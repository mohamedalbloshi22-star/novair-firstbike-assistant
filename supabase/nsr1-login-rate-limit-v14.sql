-- NSR-1 V14: fix ambiguous output-column references in login state cleanup.
-- Apply after V9. This changes only the function body and preserves grants.

create or replace function public.nsr_get_login_state(
  p_key text,
  p_window_seconds integer default 900
)
returns table(failure_count integer, lock_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return;
  end if;

  delete from public.nsr_login_attempts as attempts
  where attempts.attempt_key = p_key
    and (
      (attempts.lock_until is not null and attempts.lock_until <= now())
      or (
        attempts.lock_until is null
        and attempts.window_started_at <= now() - make_interval(secs => greatest(p_window_seconds, 1))
      )
    );

  return query
  select attempts.failure_count, attempts.lock_until
  from public.nsr_login_attempts as attempts
  where attempts.attempt_key = p_key;
end;
$$;

revoke all on function public.nsr_get_login_state(text,integer) from PUBLIC, anon, authenticated;
grant execute on function public.nsr_get_login_state(text,integer) to service_role;
