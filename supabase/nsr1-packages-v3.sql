-- NSR-1 V3: atomic client + package provisioning and plan assignment
-- Run AFTER nsr1-packages-v1.sql and nsr1-packages-v2.sql

create table if not exists public.nsr_subscription_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null,
  old_plan_code text,
  new_plan_code text,
  effective_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.nsr_admin_create_client_with_plan(
  p_name text,
  p_slug text,
  p_plan_code text,
  p_config jsonb default '{}'::jsonb,
  p_custom_ai_limit integer default null,
  p_setup_fee_override_aed numeric default null,
  p_monthly_fee_override_aed numeric default null
)
returns table(
  client_id uuid,
  client_name text,
  client_slug text,
  plan_code text,
  plan_name text,
  monthly_limit integer,
  setup_fee_aed numeric,
  monthly_fee_aed numeric,
  cycle_start date,
  cycle_end date
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_client_id uuid;
  v_plan public.nsr_plans%rowtype;
  v_cycle_start date := current_date;
  v_cycle_end date := (current_date + interval '1 month')::date;
begin
  if coalesce(trim(p_name),'') = '' then
    raise exception 'client name is required';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9_-]{2,80}$' then
    raise exception 'valid slug is required';
  end if;
  if exists(select 1 from public.clients where slug=p_slug) then
    raise exception 'client slug already exists';
  end if;

  select * into v_plan
  from public.nsr_plans
  where code=p_plan_code and active=true;
  if not found then
    raise exception 'plan not found or inactive';
  end if;

  if p_custom_ai_limit is not null and p_custom_ai_limit <= 0 then
    raise exception 'custom ai limit must be positive';
  end if;

  insert into public.clients(name,slug,config)
  values(trim(p_name),p_slug,coalesce(p_config,'{}'::jsonb))
  returning id into v_client_id;

  insert into public.nsr_client_subscriptions(
    client_id,plan_code,status,cycle_start,cycle_end,
    custom_ai_limit,setup_fee_override_aed,monthly_fee_override_aed
  ) values(
    v_client_id,p_plan_code,'active',v_cycle_start,v_cycle_end,
    p_custom_ai_limit,p_setup_fee_override_aed,p_monthly_fee_override_aed
  );

  insert into public.nsr_subscription_events(
    client_id,event_type,new_plan_code,metadata
  ) values(
    v_client_id,'created',p_plan_code,
    jsonb_build_object('custom_ai_limit',p_custom_ai_limit)
  );

  return query select
    v_client_id,
    trim(p_name),
    p_slug,
    v_plan.code,
    v_plan.name,
    coalesce(p_custom_ai_limit,v_plan.monthly_ai_responses),
    coalesce(p_setup_fee_override_aed,v_plan.setup_fee_aed),
    coalesce(p_monthly_fee_override_aed,v_plan.monthly_fee_aed),
    v_cycle_start,
    v_cycle_end;
end;
$$;

create or replace function public.nsr_admin_assign_plan(
  p_client_id uuid,
  p_plan_code text,
  p_custom_ai_limit integer default null,
  p_setup_fee_override_aed numeric default null,
  p_monthly_fee_override_aed numeric default null
)
returns table(
  client_id uuid,
  plan_code text,
  plan_name text,
  monthly_limit integer,
  cycle_start date,
  cycle_end date
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan public.nsr_plans%rowtype;
  v_old_plan text;
  v_start date := current_date;
  v_end date := (current_date + interval '1 month')::date;
begin
  if not exists(select 1 from public.clients where id=p_client_id) then
    raise exception 'client not found';
  end if;
  select * into v_plan from public.nsr_plans where code=p_plan_code and active=true;
  if not found then raise exception 'plan not found or inactive'; end if;
  if p_custom_ai_limit is not null and p_custom_ai_limit <= 0 then
    raise exception 'custom ai limit must be positive';
  end if;

  select s.plan_code into v_old_plan
  from public.nsr_client_subscriptions s
  where s.client_id=p_client_id;

  insert into public.nsr_client_subscriptions(
    client_id,plan_code,status,cycle_start,cycle_end,
    custom_ai_limit,setup_fee_override_aed,monthly_fee_override_aed
  ) values(
    p_client_id,p_plan_code,'active',v_start,v_end,
    p_custom_ai_limit,p_setup_fee_override_aed,p_monthly_fee_override_aed
  )
  on conflict(client_id) do update set
    plan_code=excluded.plan_code,
    status='active',
    cycle_start=excluded.cycle_start,
    cycle_end=excluded.cycle_end,
    custom_ai_limit=excluded.custom_ai_limit,
    setup_fee_override_aed=excluded.setup_fee_override_aed,
    monthly_fee_override_aed=excluded.monthly_fee_override_aed,
    updated_at=now();

  insert into public.nsr_subscription_events(client_id,event_type,old_plan_code,new_plan_code)
  values(p_client_id,case when v_old_plan is null then 'assigned' else 'changed' end,v_old_plan,p_plan_code);

  return query select p_client_id,v_plan.code,v_plan.name,
    coalesce(p_custom_ai_limit,v_plan.monthly_ai_responses),v_start,v_end;
end;
$$;
