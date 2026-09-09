-- NSR-1 commercial packages, subscriptions and usage counters
create extension if not exists pgcrypto;

create table if not exists public.nsr_plans (
  code text primary key,
  name text not null,
  setup_fee_aed numeric(12,2) not null,
  monthly_fee_aed numeric(12,2) not null,
  monthly_ai_responses integer not null check (monthly_ai_responses > 0),
  hard_cap boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.nsr_plans(code,name,setup_fee_aed,monthly_fee_aed,monthly_ai_responses)
values
  ('essential','NSR-1 Essential',2500,1390,10000),
  ('pro','NSR-1 Pro',5000,4290,50000),
  ('enterprise','NSR-1 Enterprise',15000,14900,200000)
on conflict (code) do update set
  name=excluded.name,
  setup_fee_aed=excluded.setup_fee_aed,
  monthly_fee_aed=excluded.monthly_fee_aed,
  monthly_ai_responses=excluded.monthly_ai_responses,
  active=true;

create table if not exists public.nsr_client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  plan_code text not null references public.nsr_plans(code),
  status text not null default 'active' check(status in ('trial','active','paused','cancelled')),
  cycle_start date not null default current_date,
  cycle_end date not null default (current_date + interval '1 month')::date,
  custom_ai_limit integer,
  setup_fee_override_aed numeric(12,2),
  monthly_fee_override_aed numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nsr_usage_counters (
  client_id uuid not null references public.clients(id) on delete cascade,
  cycle_start date not null,
  ai_responses integer not null default 0 check(ai_responses >= 0),
  updated_at timestamptz not null default now(),
  primary key(client_id,cycle_start)
);

create or replace function public.nsr_current_usage(p_client_id uuid)
returns table(
  client_id uuid,
  plan_code text,
  plan_name text,
  monthly_limit integer,
  used integer,
  remaining integer,
  usage_percent numeric,
  cycle_start date,
  cycle_end date,
  subscription_status text,
  warning_level text,
  setup_fee_aed numeric,
  monthly_fee_aed numeric
)
language sql
security definer
set search_path=public
as $$
  select
    s.client_id,
    s.plan_code,
    p.name,
    coalesce(s.custom_ai_limit,p.monthly_ai_responses),
    coalesce(u.ai_responses,0),
    greatest(coalesce(s.custom_ai_limit,p.monthly_ai_responses)-coalesce(u.ai_responses,0),0),
    round((coalesce(u.ai_responses,0)::numeric / greatest(coalesce(s.custom_ai_limit,p.monthly_ai_responses),1)::numeric)*100,1),
    s.cycle_start,
    s.cycle_end,
    s.status,
    case
      when coalesce(u.ai_responses,0) >= coalesce(s.custom_ai_limit,p.monthly_ai_responses) then 'CAP_REACHED'
      when coalesce(u.ai_responses,0)::numeric/greatest(coalesce(s.custom_ai_limit,p.monthly_ai_responses),1) >= .95 then '95'
      when coalesce(u.ai_responses,0)::numeric/greatest(coalesce(s.custom_ai_limit,p.monthly_ai_responses),1) >= .85 then '85'
      when coalesce(u.ai_responses,0)::numeric/greatest(coalesce(s.custom_ai_limit,p.monthly_ai_responses),1) >= .70 then '70'
      else 'NORMAL'
    end,
    coalesce(s.setup_fee_override_aed,p.setup_fee_aed),
    coalesce(s.monthly_fee_override_aed,p.monthly_fee_aed)
  from public.nsr_client_subscriptions s
  join public.nsr_plans p on p.code=s.plan_code
  left join public.nsr_usage_counters u on u.client_id=s.client_id and u.cycle_start=s.cycle_start
  where s.client_id=p_client_id
  limit 1;
$$;

create or replace function public.nsr_check_quota(p_client_id uuid)
returns table(allowed boolean, used integer, monthly_limit integer, remaining integer, usage_percent numeric, warning_level text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sub public.nsr_client_subscriptions%rowtype;
  v_plan public.nsr_plans%rowtype;
  v_limit integer;
  v_used integer;
begin
  select * into v_sub from public.nsr_client_subscriptions where client_id=p_client_id;
  if not found or v_sub.status not in ('trial','active') then
    return query select false,0,0,0,0::numeric,'NO_ACTIVE_PLAN'::text;
    return;
  end if;
  select * into v_plan from public.nsr_plans where code=v_sub.plan_code and active=true;
  if not found then
    return query select false,0,0,0,0::numeric,'PLAN_INACTIVE'::text;
    return;
  end if;
  v_limit := coalesce(v_sub.custom_ai_limit,v_plan.monthly_ai_responses);
  select coalesce(ai_responses,0) into v_used from public.nsr_usage_counters where client_id=p_client_id and cycle_start=v_sub.cycle_start;
  v_used := coalesce(v_used,0);
  return query select
    (not v_plan.hard_cap or v_used < v_limit),
    v_used,
    v_limit,
    greatest(v_limit-v_used,0),
    round((v_used::numeric/greatest(v_limit,1)::numeric)*100,1),
    case
      when v_used >= v_limit then 'CAP_REACHED'
      when v_used::numeric/v_limit >= .95 then '95'
      when v_used::numeric/v_limit >= .85 then '85'
      when v_used::numeric/v_limit >= .70 then '70'
      else 'NORMAL'
    end;
end;
$$;

create or replace function public.nsr_record_ai_response(p_client_id uuid)
returns table(used integer, monthly_limit integer, remaining integer, usage_percent numeric, warning_level text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sub public.nsr_client_subscriptions%rowtype;
  v_plan public.nsr_plans%rowtype;
  v_limit integer;
  v_used integer;
begin
  select * into v_sub from public.nsr_client_subscriptions where client_id=p_client_id for update;
  if not found then raise exception 'subscription not found'; end if;
  select * into v_plan from public.nsr_plans where code=v_sub.plan_code;
  v_limit := coalesce(v_sub.custom_ai_limit,v_plan.monthly_ai_responses);
  insert into public.nsr_usage_counters(client_id,cycle_start,ai_responses)
  values(p_client_id,v_sub.cycle_start,1)
  on conflict(client_id,cycle_start) do update set ai_responses=public.nsr_usage_counters.ai_responses+1,updated_at=now()
  returning ai_responses into v_used;
  return query select
    v_used,
    v_limit,
    greatest(v_limit-v_used,0),
    round((v_used::numeric/greatest(v_limit,1)::numeric)*100,1),
    case
      when v_used >= v_limit then 'CAP_REACHED'
      when v_used::numeric/v_limit >= .95 then '95'
      when v_used::numeric/v_limit >= .85 then '85'
      when v_used::numeric/v_limit >= .70 then '70'
      else 'NORMAL'
    end;
end;
$$;

create or replace view public.nsr_admin_usage_overview as
select
  c.id client_id,
  c.slug,
  coalesce(c.config->>'brand_name',c.name,c.slug) client_name,
  x.plan_code,x.plan_name,x.monthly_limit,x.used,x.remaining,x.usage_percent,
  x.warning_level,x.cycle_start,x.cycle_end,x.subscription_status,x.monthly_fee_aed
from public.clients c
join lateral public.nsr_current_usage(c.id) x on true;
