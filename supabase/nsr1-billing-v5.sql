-- NSR-1 V5: Stripe billing integration schema
-- Run AFTER nsr1-packages-v1.sql through nsr1-packages-v4-security.sql

alter table public.nsr_plans
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_setup_price_id text;

alter table public.nsr_client_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_status text,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists stripe_current_period_end timestamptz,
  add column if not exists last_payment_at timestamptz,
  add column if not exists billing_updated_at timestamptz;

create unique index if not exists nsr_client_subscriptions_stripe_customer_uidx
  on public.nsr_client_subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists nsr_client_subscriptions_stripe_subscription_uidx
  on public.nsr_client_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.nsr_billing_events (
  id text primary key,
  event_type text not null,
  client_id uuid references public.clients(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  processed_at timestamptz not null default now()
);

create index if not exists nsr_billing_events_client_idx
  on public.nsr_billing_events(client_id,processed_at desc);

revoke all on table public.nsr_billing_events from anon, authenticated;
grant select, insert, update, delete on table public.nsr_billing_events to service_role;

grant select, insert, update, delete on table public.nsr_plans to service_role;
grant select, insert, update, delete on table public.nsr_client_subscriptions to service_role;
