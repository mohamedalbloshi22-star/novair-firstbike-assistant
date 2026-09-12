-- BSR-1 Platform Operations V16 — Preview-only operational metrics.
-- The function is service-role only and does not broaden browser/database access.
create or replace function public.bsr_platform_metrics()
returns table (
  client_id uuid,
  knowledge_count bigint,
  open_support_count bigint,
  conversation_count bigint,
  ai_used integer,
  ai_limit integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    (select count(*) from public.knowledge_base k where k.client_id = c.id and k.active is true),
    (select count(*) from public.nsr_support_requests s where s.client_id = c.id and s.status not in ('closed', 'resolved_auto')),
    (select count(*) from public.conversations v where v.client_id = c.id),
    coalesce((select u.ai_responses from public.nsr_usage_counters u where u.client_id = c.id and u.cycle_start = coalesce(sub.cycle_start, current_date) limit 1), 0),
    coalesce(sub.custom_ai_limit, p.monthly_ai_responses, 0)
  from public.clients c
  left join public.nsr_client_subscriptions sub on sub.client_id = c.id
  left join public.nsr_plans p on p.code = sub.plan_code;
$$;

revoke all on function public.bsr_platform_metrics() from public, anon, authenticated;
grant execute on function public.bsr_platform_metrics() to service_role;

update public.nsr_plans
set name = case code
  when 'essential' then 'BSR-1 Essential'
  when 'pro' then 'BSR-1 Professional'
  when 'enterprise' then 'BSR-1 Business'
  else name
end
where code in ('essential', 'pro', 'enterprise');

update public.bsr_client_lifecycle l
set stage = 'service_configured', readiness_percent = 55, updated_at = now()
from public.clients c
where c.id = l.client_id
  and c.slug = 'bsr-platform-journey'
  and l.stage = 'package_selected'
  and l.technical_status = 'not_tested';
