-- NSR-1 pre-merge audit
-- Read-only checks except the optional test cleanup section at the bottom.

-- 1) Active clients that DO NOT have a package/subscription.
select
  c.id,
  c.name,
  c.slug,
  c.config->>'active' as active_flag
from public.clients c
left join public.nsr_client_subscriptions s
  on s.client_id = c.id
where coalesce((c.config->>'active')::boolean, true) = true
  and s.client_id is null
order by c.name;

-- 2) All active clients with current package details.
select
  c.name,
  c.slug,
  s.plan_code,
  s.status,
  s.custom_ai_limit,
  s.cycle_start,
  s.cycle_end
from public.clients c
left join public.nsr_client_subscriptions s
  on s.client_id = c.id
where coalesce((c.config->>'active')::boolean, true) = true
order by c.name;

-- 3) Current usage overview.
select *
from public.nsr_admin_usage_overview
order by client_name;

-- 4) Alert history for the quota test client.
select
  threshold,
  created_at
from public.nsr_usage_alerts
where client_id = (
  select id
  from public.clients
  where slug = 'nsr-test-20'
  limit 1
)
order by threshold;

-- Expected thresholds for completed cap test: 70, 85, 95, 100.

-- 5) Current usage for the quota test client.
select public.nsr_current_usage(
  (
    select id
    from public.clients
    where slug = 'nsr-test-20'
    limit 1
  )
);

-- 6) OPTIONAL: release one reserved response for the test client.
-- Run only when intentionally testing release behavior.
-- select public.nsr_release_ai_response(
--   (select id from public.clients where slug = 'nsr-test-20' limit 1)
-- );

-- 7) OPTIONAL cleanup after all tests are complete.
-- delete from public.clients where slug = 'nsr-test-20';
