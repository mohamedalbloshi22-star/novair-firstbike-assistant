-- NSR-1 V8: client support inquiries and admin replies
create table if not exists public.nsr_support_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  message text not null,
  auto_answer text,
  admin_reply text,
  status text not null default 'pending' check (status in ('resolved_auto','pending','answered','closed')),
  escalated boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists nsr_support_requests_client_created_idx
  on public.nsr_support_requests(client_id, created_at desc);

create index if not exists nsr_support_requests_status_idx
  on public.nsr_support_requests(status, created_at desc);

alter table public.nsr_support_requests enable row level security;
revoke all on public.nsr_support_requests from anon, authenticated;
