-- NSR-1 V9: persistent client login rate limiting in Supabase
-- Run after the existing NSR-1 schema/security migrations.

create table if not exists public.nsr_login_attempts (
  attempt_key text primary key,
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  lock_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists nsr_login_attempts_updated_at_idx
  on public.nsr_login_attempts (updated_at);

revoke all on table public.nsr_login_attempts from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.nsr_login_attempts to service_role;

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

  delete from public.nsr_login_attempts
  where attempt_key = p_key
    and (
      (lock_until is not null and lock_until <= now())
      or (lock_until is null and window_started_at <= now() - make_interval(secs => greatest(p_window_seconds, 1)))
    );

  return query
  select a.failure_count, a.lock_until
  from public.nsr_login_attempts a
  where a.attempt_key = p_key;
end;
$$;

create or replace function public.nsr_record_login_failure(
  p_key text,
  p_max_attempts integer default 5,
  p_window_seconds integer default 900,
  p_lock_seconds integer default 900
)
returns table(failure_count integer, lock_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
  v_lock_until timestamptz;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'attempt key is required';
  end if;

  insert into public.nsr_login_attempts(attempt_key, failure_count, window_started_at, lock_until, updated_at)
  values (p_key, 0, now(), null, now())
  on conflict (attempt_key) do nothing;

  select a.failure_count, a.window_started_at, a.lock_until
    into v_count, v_window_started_at, v_lock_until
  from public.nsr_login_attempts a
  where a.attempt_key = p_key
  for update;

  if v_lock_until is not null and v_lock_until > now() then
    return query select v_count, v_lock_until;
    return;
  end if;

  if v_lock_until is not null and v_lock_until <= now() then
    v_count := 0;
    v_window_started_at := now();
    v_lock_until := null;
  elsif v_window_started_at <= now() - make_interval(secs => greatest(p_window_seconds, 1)) then
    v_count := 0;
    v_window_started_at := now();
  end if;

  v_count := v_count + 1;
  if v_count >= greatest(p_max_attempts, 1) then
    v_lock_until := now() + make_interval(secs => greatest(p_lock_seconds, 1));
  else
    v_lock_until := null;
  end if;

  update public.nsr_login_attempts
  set failure_count = v_count,
      window_started_at = v_window_started_at,
      lock_until = v_lock_until,
      updated_at = now()
  where attempt_key = p_key;

  return query select v_count, v_lock_until;
end;
$$;

create or replace function public.nsr_clear_login_failures(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.nsr_login_attempts where attempt_key = p_key;
$$;

revoke all on function public.nsr_get_login_state(text,integer) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_record_login_failure(text,integer,integer,integer) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_clear_login_failures(text) from PUBLIC, anon, authenticated;

grant execute on function public.nsr_get_login_state(text,integer) to service_role;
grant execute on function public.nsr_record_login_failure(text,integer,integer,integer) to service_role;
grant execute on function public.nsr_clear_login_failures(text) to service_role;
