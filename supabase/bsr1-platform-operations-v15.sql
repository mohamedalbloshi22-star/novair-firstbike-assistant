-- BSR-1 Platform Operations V15 — Preview first
create table if not exists public.bsr_client_lifecycle (
  client_id uuid primary key references public.clients(id) on delete cascade,
  environment text not null default 'preview' check (environment in ('preview','production')),
  stage text not null default 'client_created' check (stage in ('client_created','tenant_created','package_selected','service_configured','knowledge_added','testing','pending_approval','approved','active','suspended')),
  approval_status text not null default 'not_submitted' check (approval_status in ('not_submitted','pending','approved','rejected')),
  technical_status text not null default 'not_tested' check (technical_status in ('not_tested','testing','pass','fail')),
  readiness_percent integer not null default 10 check (readiness_percent between 0 and 100),
  founder_approved_at timestamptz,
  founder_approved_by text,
  activated_at timestamptz,
  suspended_at timestamptz,
  last_health_check_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bsr_approval_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  approval_type text not null default 'client_activation',
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  requested_by text not null,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text
);

create unique index if not exists bsr_one_pending_activation_approval
  on public.bsr_approval_requests(client_id,approval_type) where status='pending';

create table if not exists public.bsr_audit_log (
  id bigint generated always as identity primary key,
  client_id uuid references public.clients(id) on delete set null,
  environment text not null check (environment in ('preview','production')),
  actor_type text not null check (actor_type in ('founder','admin','client','system')),
  actor_ref text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_ref uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create or replace function public.bsr_audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'BSR audit records are immutable'; end $$;
drop trigger if exists bsr_audit_no_update on public.bsr_audit_log;
create trigger bsr_audit_no_update before update or delete on public.bsr_audit_log
for each row execute function public.bsr_audit_immutable();

alter table public.bsr_client_lifecycle enable row level security;
alter table public.bsr_approval_requests enable row level security;
alter table public.bsr_audit_log enable row level security;
revoke all on public.bsr_client_lifecycle, public.bsr_approval_requests, public.bsr_audit_log from anon, authenticated;

create index if not exists bsr_lifecycle_stage_idx on public.bsr_client_lifecycle(stage,approval_status);
create index if not exists bsr_approval_client_idx on public.bsr_approval_requests(client_id,requested_at desc);
create index if not exists bsr_audit_client_created_idx on public.bsr_audit_log(client_id,created_at desc);

insert into public.bsr_client_lifecycle(client_id,environment,stage,approval_status,technical_status,readiness_percent,notes)
select id,'preview',case when coalesce((config->>'active')::boolean,false) then 'active' else 'service_configured' end,
       case when coalesce((config->>'active')::boolean,false) then 'approved' else 'not_submitted' end,
       'pass',case when coalesce((config->>'active')::boolean,false) then 100 else 60 end,
       'Backfilled from Founder Approved Preview baseline'
from public.clients
on conflict (client_id) do nothing;
