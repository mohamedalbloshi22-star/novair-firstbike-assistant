-- NSR-1 V4: security hardening for package/quota RPCs and package tables
-- Run AFTER V1, V2 and V3.

-- Remove default/public execution access from SECURITY DEFINER RPCs.
revoke all on function public.nsr_roll_cycle_if_needed(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_current_usage(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_check_quota(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_record_ai_response(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_reserve_ai_response(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_release_ai_response(uuid) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_admin_create_client_with_plan(text,text,text,jsonb,integer,numeric,numeric) from PUBLIC, anon, authenticated;
revoke all on function public.nsr_admin_assign_plan(uuid,text,integer,numeric,numeric) from PUBLIC, anon, authenticated;

-- Server-side service role is the only application role allowed to execute these RPCs.
grant execute on function public.nsr_roll_cycle_if_needed(uuid) to service_role;
grant execute on function public.nsr_current_usage(uuid) to service_role;
grant execute on function public.nsr_check_quota(uuid) to service_role;
grant execute on function public.nsr_record_ai_response(uuid) to service_role;
grant execute on function public.nsr_reserve_ai_response(uuid) to service_role;
grant execute on function public.nsr_release_ai_response(uuid) to service_role;
grant execute on function public.nsr_admin_create_client_with_plan(text,text,text,jsonb,integer,numeric,numeric) to service_role;
grant execute on function public.nsr_admin_assign_plan(uuid,text,integer,numeric,numeric) to service_role;

-- Package and usage data must not be directly readable/writable by browser roles.
revoke all on table public.nsr_plans from anon, authenticated;
revoke all on table public.nsr_client_subscriptions from anon, authenticated;
revoke all on table public.nsr_usage_counters from anon, authenticated;
revoke all on table public.nsr_usage_alerts from anon, authenticated;
revoke all on table public.nsr_subscription_events from anon, authenticated;
revoke all on table public.nsr_admin_usage_overview from anon, authenticated;

-- Service role keeps full backend access.
grant select, insert, update, delete on table public.nsr_plans to service_role;
grant select, insert, update, delete on table public.nsr_client_subscriptions to service_role;
grant select, insert, update, delete on table public.nsr_usage_counters to service_role;
grant select, insert, update, delete on table public.nsr_usage_alerts to service_role;
grant select, insert, update, delete on table public.nsr_subscription_events to service_role;
grant select on table public.nsr_admin_usage_overview to service_role;
