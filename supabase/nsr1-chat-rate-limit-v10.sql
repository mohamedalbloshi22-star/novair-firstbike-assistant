-- NSR-1 V10: persistent distributed chat rate limiting
-- Purpose: protect each tenant's AI quota from spam/bot abuse before AI quota reservation.
-- Recommended application limit: 12 AI-bound chat requests per 60 seconds per client + IP,
-- followed by a 120-second temporary block. The API may pass different values if needed.

create table if not exists public.nsr_chat_rate_limits (
  rate_key text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists nsr_chat_rate_limits_updated_at_idx
  on public.nsr_chat_rate_limits (updated_at);

revoke all on table public.nsr_chat_rate_limits from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.nsr_chat_rate_limits to service_role;

create or replace function public.nsr_check_chat_rate_limit(
  p_key text,
  p_max_requests integer default 12,
  p_window_seconds integer default 60,
  p_block_seconds integer default 120
)
returns table(
  allowed boolean,
  request_count integer,
  remaining integer,
  retry_after_seconds integer,
  blocked_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
  v_blocked_until timestamptz;
  v_max integer := greatest(p_max_requests, 1);
  v_window integer := greatest(p_window_seconds, 1);
  v_block integer := greatest(p_block_seconds, 1);
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'rate key is required';
  end if;

  insert into public.nsr_chat_rate_limits(rate_key, request_count, window_started_at, blocked_until, updated_at)
  values (p_key, 0, now(), null, now())
  on conflict (rate_key) do nothing;

  select r.request_count, r.window_started_at, r.blocked_until
    into v_count, v_window_started_at, v_blocked_until
  from public.nsr_chat_rate_limits r
  where r.rate_key = p_key
  for update;

  if v_blocked_until is not null and v_blocked_until > now() then
    return query
    select false,
           v_count,
           0,
           greatest(1, ceil(extract(epoch from (v_blocked_until - now())))::integer),
           v_blocked_until;
    return;
  end if;

  if v_blocked_until is not null and v_blocked_until <= now() then
    v_count := 0;
    v_window_started_at := now();
    v_blocked_until := null;
  elsif v_window_started_at <= now() - make_interval(secs => v_window) then
    v_count := 0;
    v_window_started_at := now();
  end if;

  v_count := v_count + 1;

  if v_count > v_max then
    v_blocked_until := now() + make_interval(secs => v_block);

    update public.nsr_chat_rate_limits
    set request_count = v_count,
        window_started_at = v_window_started_at,
        blocked_until = v_blocked_until,
        updated_at = now()
    where rate_key = p_key;

    return query select false, v_count, 0, v_block, v_blocked_until;
    return;
  end if;

  update public.nsr_chat_rate_limits
  set request_count = v_count,
      window_started_at = v_window_started_at,
      blocked_until = null,
      updated_at = now()
  where rate_key = p_key;

  return query
  select true,
         v_count,
         greatest(v_max - v_count, 0),
         0,
         null::timestamptz;
end;
$$;

revoke all on function public.nsr_check_chat_rate_limit(text,integer,integer,integer) from PUBLIC, anon, authenticated;
grant execute on function public.nsr_check_chat_rate_limit(text,integer,integer,integer) to service_role;

-- Optional housekeeping; safe to run periodically.
-- delete from public.nsr_chat_rate_limits
-- where updated_at < now() - interval '7 days'
--   and (blocked_until is null or blocked_until < now());
