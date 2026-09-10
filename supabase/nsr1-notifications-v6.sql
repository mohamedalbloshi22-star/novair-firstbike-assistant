-- NSR-1 V6: notification log for usage/payment reminders and customer communications
-- Run AFTER V1-V5

create table if not exists public.nsr_notification_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  cycle_start date,
  notification_type text not null,
  recipient text not null,
  subject text,
  status text not null default 'sent' check (status in ('sent','failed','skipped')),
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists nsr_notification_once_per_cycle_uidx
  on public.nsr_notification_log(client_id,coalesce(cycle_start,'1900-01-01'::date),notification_type,recipient);

create index if not exists nsr_notification_client_created_idx
  on public.nsr_notification_log(client_id,created_at desc);

revoke all on table public.nsr_notification_log from anon, authenticated;
grant select, insert, update, delete on table public.nsr_notification_log to service_role;
