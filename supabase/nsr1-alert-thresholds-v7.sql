-- NSR-1 V7: customer-facing usage thresholds 70 / 85 / 95 / 100
-- Run AFTER V1-V6.
-- Usage alerts are standardized on 70/85/95/100.

delete from public.nsr_usage_alerts where threshold in (50,75,90);

alter table public.nsr_usage_alerts
  drop constraint if exists nsr_usage_alerts_threshold_check;

alter table public.nsr_usage_alerts
  add constraint nsr_usage_alerts_threshold_check
  check (threshold in (70,85,95,100));

create or replace function public.nsr_reserve_ai_response(p_client_id uuid)
returns table(
  allowed boolean,
  used integer,
  monthly_limit integer,
  remaining integer,
  usage_percent numeric,
  warning_level text,
  cycle_start date,
  cycle_end date,
  newly_crossed_threshold integer
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sub public.nsr_client_subscriptions%rowtype;
  v_plan public.nsr_plans%rowtype;
  v_limit integer;
  v_before integer;
  v_used integer;
  v_pct numeric;
  v_threshold integer := null;
begin
  perform public.nsr_roll_cycle_if_needed(p_client_id);

  select * into v_sub
  from public.nsr_client_subscriptions
  where client_id=p_client_id
  for update;

  if not found or v_sub.status not in ('trial','active') then
    return query select false,0,0,0,0::numeric,'NO_ACTIVE_PLAN'::text,null::date,null::date,null::integer;
    return;
  end if;

  select * into v_plan
  from public.nsr_plans
  where code=v_sub.plan_code and active=true;

  if not found then
    return query select false,0,0,0,0::numeric,'PLAN_INACTIVE'::text,v_sub.cycle_start,v_sub.cycle_end,null::integer;
    return;
  end if;

  v_limit := coalesce(v_sub.custom_ai_limit,v_plan.monthly_ai_responses);

  insert into public.nsr_usage_counters(client_id,cycle_start,ai_responses)
  values(p_client_id,v_sub.cycle_start,0)
  on conflict on constraint nsr_usage_counters_pkey do nothing;

  select u.ai_responses into v_before
  from public.nsr_usage_counters u
  where u.client_id=p_client_id and u.cycle_start=v_sub.cycle_start
  for update;

  v_before := coalesce(v_before,0);

  if v_plan.hard_cap and v_before >= v_limit then
    return query select false,v_before,v_limit,0,100::numeric,'CAP_REACHED'::text,v_sub.cycle_start,v_sub.cycle_end,null::integer;
    return;
  end if;

  update public.nsr_usage_counters u
  set ai_responses=u.ai_responses+1,
      updated_at=now()
  where u.client_id=p_client_id and u.cycle_start=v_sub.cycle_start
  returning u.ai_responses into v_used;

  v_pct := round((v_used::numeric/greatest(v_limit,1)::numeric)*100,1);

  if v_before::numeric/greatest(v_limit,1) < .70 and v_used::numeric/greatest(v_limit,1) >= .70 then v_threshold := 70;
  elsif v_before::numeric/greatest(v_limit,1) < .85 and v_used::numeric/greatest(v_limit,1) >= .85 then v_threshold := 85;
  elsif v_before::numeric/greatest(v_limit,1) < .95 and v_used::numeric/greatest(v_limit,1) >= .95 then v_threshold := 95;
  elsif v_before < v_limit and v_used >= v_limit then v_threshold := 100;
  end if;

  if v_threshold is not null then
    insert into public.nsr_usage_alerts(client_id,cycle_start,threshold)
    values(p_client_id,v_sub.cycle_start,v_threshold)
    on conflict on constraint nsr_usage_alerts_client_id_cycle_start_threshold_key do nothing;
  end if;

  return query select
    true,
    v_used,
    v_limit,
    greatest(v_limit-v_used,0),
    v_pct,
    case
      when v_used >= v_limit then 'CAP_REACHED'
      when v_used::numeric/greatest(v_limit,1) >= .95 then '95'
      when v_used::numeric/greatest(v_limit,1) >= .85 then '85'
      when v_used::numeric/greatest(v_limit,1) >= .70 then '70'
      else 'NORMAL'
    end,
    v_sub.cycle_start,
    v_sub.cycle_end,
    v_threshold;
end;
$$;

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
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.nsr_roll_cycle_if_needed(p_client_id);

  return query
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
end;
$$;
