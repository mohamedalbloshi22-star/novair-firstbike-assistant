-- BSR-1 Clean Build V2. Preview project only: mpwrsbtlfyvuufgsfxyi.
create schema if not exists bsr1_v2;

create table if not exists bsr1_v2.tenants (
  id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 120), status text not null default 'pilot' check (status in ('pilot','active','suspended')),
  created_at timestamptz not null default now()
);
create table if not exists bsr1_v2.memberships (
  user_id uuid not null references auth.users(id) on delete cascade, tenant_id uuid not null references bsr1_v2.tenants(id) on delete cascade,
  role text not null check (role in ('client_admin','agent','viewer')), primary key(user_id,tenant_id)
);
create table if not exists bsr1_v2.knowledge_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references bsr1_v2.tenants(id) on delete cascade,
  title text not null, content text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists bsr1_v2.support_requests (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references bsr1_v2.tenants(id) on delete cascade,
  subject text not null, status text not null default 'open' check(status in ('open','in_progress','resolved','closed')), created_at timestamptz not null default now()
);
create table if not exists bsr1_v2.audit_events (
  id bigint generated always as identity primary key, tenant_id uuid, actor_id uuid, action text not null, object_type text not null,
  object_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

alter table bsr1_v2.tenants enable row level security;
alter table bsr1_v2.memberships enable row level security;
alter table bsr1_v2.knowledge_items enable row level security;
alter table bsr1_v2.support_requests enable row level security;
alter table bsr1_v2.audit_events enable row level security;

create or replace function bsr1_v2.has_tenant_access(target uuid) returns boolean language sql stable security definer set search_path=bsr1_v2,public as $$
  select exists(select 1 from bsr1_v2.memberships m where m.user_id=auth.uid() and m.tenant_id=target)
$$;
revoke all on function bsr1_v2.has_tenant_access(uuid) from public;
grant execute on function bsr1_v2.has_tenant_access(uuid) to authenticated;

drop policy if exists tenant_members_only on bsr1_v2.tenants;
create policy tenant_members_only on bsr1_v2.tenants for select to authenticated using (bsr1_v2.has_tenant_access(id));
drop policy if exists own_membership_only on bsr1_v2.memberships;
create policy own_membership_only on bsr1_v2.memberships for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists knowledge_tenant_isolation on bsr1_v2.knowledge_items;
create policy knowledge_tenant_isolation on bsr1_v2.knowledge_items for all to authenticated using (bsr1_v2.has_tenant_access(tenant_id)) with check (bsr1_v2.has_tenant_access(tenant_id));
drop policy if exists support_tenant_isolation on bsr1_v2.support_requests;
create policy support_tenant_isolation on bsr1_v2.support_requests for all to authenticated using (bsr1_v2.has_tenant_access(tenant_id)) with check (bsr1_v2.has_tenant_access(tenant_id));
drop policy if exists audit_closed_to_clients on bsr1_v2.audit_events;
create policy audit_closed_to_clients on bsr1_v2.audit_events for select to authenticated using (false);

create index if not exists memberships_tenant_idx on bsr1_v2.memberships(tenant_id);
create index if not exists knowledge_tenant_idx on bsr1_v2.knowledge_items(tenant_id);
create index if not exists support_tenant_idx on bsr1_v2.support_requests(tenant_id);

revoke all on schema bsr1_v2 from public, anon;
grant usage on schema bsr1_v2 to authenticated, service_role;
grant select on bsr1_v2.tenants, bsr1_v2.memberships to authenticated;
grant select,insert,update,delete on bsr1_v2.knowledge_items, bsr1_v2.support_requests to authenticated;
grant all on all tables in schema bsr1_v2 to service_role;
