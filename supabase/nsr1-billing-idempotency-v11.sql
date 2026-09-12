-- NSR-1 V11: atomic Stripe webhook idempotency claim ledger
-- Prevent concurrent delivery of the same Stripe event from executing side effects twice.

create table if not exists public.nsr_billing_event_claims (
  event_id text primary key,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  attempts integer not null default 1 check (attempts >= 1),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);

create index if not exists nsr_billing_event_claims_updated_at_idx
  on public.nsr_billing_event_claims(updated_at);

revoke all on table public.nsr_billing_event_claims from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.nsr_billing_event_claims to service_role;

create or replace function public.nsr_claim_billing_event(p_event_id text)
returns table(claimed boolean, status text, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean := false;
  v_status text;
  v_attempts integer;
  v_updated_at timestamptz;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'event id is required';
  end if;

  with ins as (
    insert into public.nsr_billing_event_claims(event_id,status,attempts,claimed_at,updated_at,last_error)
    values (p_event_id,'processing',1,now(),now(),null)
    on conflict (event_id) do nothing
    returning 1
  )
  select exists(select 1 from ins) into v_inserted;

  if v_inserted then
    return query select true,'processing'::text,1;
    return;
  end if;

  select c.status,c.attempts,c.updated_at
    into v_status,v_attempts,v_updated_at
  from public.nsr_billing_event_claims c
  where c.event_id=p_event_id
  for update;

  if v_status='completed' then
    return query select false,v_status,v_attempts;
    return;
  end if;

  if v_status='processing' and v_updated_at >= now() - interval '5 minutes' then
    return query select false,v_status,v_attempts;
    return;
  end if;

  update public.nsr_billing_event_claims as c
  set status='processing',
      attempts=c.attempts+1,
      claimed_at=now(),
      updated_at=now(),
      last_error=null
  where c.event_id=p_event_id
  returning c.attempts into v_attempts;

  return query select true,'processing'::text,v_attempts;
end;
$$;

create or replace function public.nsr_finish_billing_event(
  p_event_id text,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.nsr_billing_event_claims
  set status=case when p_success then 'completed' else 'failed' end,
      updated_at=now(),
      last_error=case when p_success then null else left(coalesce(p_error,'unknown error'),1000) end
  where event_id=p_event_id;
end;
$$;

revoke all on function public.nsr_claim_billing_event(text) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_finish_billing_event(text,boolean,text) from PUBLIC, anon, authenticated;
grant execute on function public.nsr_claim_billing_event(text) to service_role;
grant execute on function public.nsr_finish_billing_event(text,boolean,text) to service_role;
