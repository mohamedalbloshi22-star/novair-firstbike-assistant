-- NSR-1 pre-merge audit
-- Read-only checks except the optional test cleanup section at the bottom.

-- Known non-commercial test/demo clients.
-- They are intentionally excluded from the commercial subscription audit.
-- demo-clinic
-- first-bike
-- novaire-test-center
-- nsr-test-20

-- 1) COMMERCIAL active clients that DO NOT have a package/subscription.
-- Expected result before production: NO ROWS.
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
  and c.slug not in (
    'demo-clinic',
    'first-bike',
    'novaire-test-center',
    'nsr-test-20'
  )
order by c.name;

-- 2) Known test/demo clients and whether they currently have a package.
-- These records are for testing only and must not be treated as paid subscriptions.
select
  c.name,
  c.slug,
  coalesce((c.config->>'active')::boolean, true) as active,
  s.plan_code,
  s.status,
  s.custom_ai_limit,
  s.cycle_start,
  s.cycle_end
from public.clients c
left join public.nsr_client_subscriptions s
  on s.client_id = c.id
where c.slug in (
  'demo-clinic',
  'first-bike',
  'novaire-test-center',
  'nsr-test-20'
)
order by c.name;

-- 3) All COMMERCIAL active clients with current package details.
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
  and c.slug not in (
    'demo-clinic',
    'first-bike',
    'novaire-test-center',
    'nsr-test-20'
  )
order by c.name;

-- 4) Current usage overview.
select *
from public.nsr_admin_usage_overview
order by client_name;

-- 5) Alert history for the quota test client.
-- Historical V2 rows may include 70/85/95/100.
-- New V7 alerts use 50/75/90/100.
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
order by created_at, threshold;

-- 6) Current usage for the quota test client.
select public.nsr_current_usage(
  (
    select id
    from public.clients
    where slug = 'nsr-test-20'
    limit 1
  )
);

-- 7) Notification log overview.
-- Verifies V6 exists and shows usage/payment/customer-email events.
select
  c.name as client_name,
  c.slug,
  n.cycle_start,
  n.notification_type,
  n.recipient,
  n.subject,
  n.status,
  n.created_at
from public.nsr_notification_log n
join public.clients c on c.id = n.client_id
order by n.created_at desc
limit 100;

-- 8) Duplicate notification safety check.
-- Expected result: NO ROWS.
select
  client_id,
  coalesce(cycle_start,'1900-01-01'::date) as cycle_key,
  notification_type,
  recipient,
  count(*) as duplicate_count
from public.nsr_notification_log
group by client_id, coalesce(cycle_start,'1900-01-01'::date), notification_type, recipient
having count(*) > 1;

-- 9) OPTIONAL: release one reserved response for the test client.
-- Run only when intentionally testing release behavior.
-- select public.nsr_release_ai_response(
--   (select id from public.clients where slug = 'nsr-test-20' limit 1)
-- );

-- 10) OPTIONAL cleanup after all tests are complete.
-- Do not delete demo-clinic, first-bike, or novaire-test-center unless they are no longer needed.
-- delete from public.clients where slug = 'nsr-test-20';
