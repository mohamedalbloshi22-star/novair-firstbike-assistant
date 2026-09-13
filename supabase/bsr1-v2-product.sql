-- BSR-1 V2 product layer. Apply to isolated Preview project only.
create table if not exists bsr1_v2.client_settings (
  tenant_id uuid primary key references bsr1_v2.tenants(id) on delete cascade,
  business_name text not null, welcome_message text not null default 'مرحبًا، كيف يمكنني مساعدتك؟',
  language text not null default 'ar' check(language in ('ar','en')), plan text not null default 'preview', updated_at timestamptz not null default now()
);
create table if not exists bsr1_v2.conversations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references bsr1_v2.tenants(id) on delete cascade,
  question text not null, answer text not null, source_knowledge_id uuid references bsr1_v2.knowledge_items(id) on delete set null, created_at timestamptz not null default now()
);
alter table bsr1_v2.support_requests add column if not exists details text not null default '';
alter table bsr1_v2.support_requests add column if not exists updated_at timestamptz not null default now();
create table if not exists bsr1_v2.preview_api_tokens (
  id uuid primary key default gen_random_uuid(), token_hash text not null unique, label text not null,
  expires_at timestamptz not null, revoked_at timestamptz
);
alter table bsr1_v2.client_settings enable row level security;
alter table bsr1_v2.conversations enable row level security;
alter table bsr1_v2.preview_api_tokens enable row level security;
drop policy if exists settings_deny_direct on bsr1_v2.client_settings;
create policy settings_deny_direct on bsr1_v2.client_settings for all using(false) with check(false);
drop policy if exists conversations_deny_direct on bsr1_v2.conversations;
create policy conversations_deny_direct on bsr1_v2.conversations for all using(false) with check(false);
drop policy if exists tokens_deny_direct on bsr1_v2.preview_api_tokens;
create policy tokens_deny_direct on bsr1_v2.preview_api_tokens for all using(false) with check(false);
create index if not exists conversations_tenant_created_idx on bsr1_v2.conversations(tenant_id,created_at desc);
create index if not exists conversations_source_knowledge_idx on bsr1_v2.conversations(source_knowledge_id);
create index if not exists support_tenant_status_idx on bsr1_v2.support_requests(tenant_id,status);
revoke all on bsr1_v2.client_settings,bsr1_v2.conversations,bsr1_v2.preview_api_tokens from public,anon,authenticated;

insert into bsr1_v2.tenants(slug,name,status) values ('preview-tenant-a','عميل المعاينة','pilot') on conflict(slug) do update set name=excluded.name;
insert into bsr1_v2.client_settings(tenant_id,business_name,welcome_message,language,plan)
select id,'عميل المعاينة','مرحبًا بك، كيف يمكنني مساعدتك؟','ar','preview' from bsr1_v2.tenants where slug='preview-tenant-a'
on conflict(tenant_id) do nothing;
insert into bsr1_v2.knowledge_items(tenant_id,title,content)
select id,'ساعات العمل','ساعات العمل من الأحد إلى الخميس، من التاسعة صباحًا حتى الخامسة مساءً.' from bsr1_v2.tenants t where slug='preview-tenant-a'
and not exists(select 1 from bsr1_v2.knowledge_items k where k.tenant_id=t.id and k.title='ساعات العمل');
insert into bsr1_v2.preview_api_tokens(token_hash,label,expires_at) values ('__TOKEN_HASH__','clean-v2-preview',now()+interval '30 days')
on conflict(token_hash) do update set expires_at=excluded.expires_at,revoked_at=null;

create or replace function public.bsr1_v2_product_api(p_token text,p_action text,p_tenant_slug text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=bsr1_v2,pg_temp as $$
declare t bsr1_v2.tenants%rowtype; k bsr1_v2.knowledge_items%rowtype; result jsonb; item_id uuid; new_status text;
begin
  if not exists(select 1 from bsr1_v2.preview_api_tokens x where x.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and x.revoked_at is null and x.expires_at>now()) then raise exception 'unauthorized' using errcode='28000'; end if;
  select * into t from bsr1_v2.tenants where slug=p_tenant_slug;
  if t.id is null then raise exception 'tenant_not_found' using errcode='P0002'; end if;
  if p_action='dashboard' then
    return jsonb_build_object('conversationsToday',(select count(*) from bsr1_v2.conversations where tenant_id=t.id and created_at>=current_date),'openSupport',(select count(*) from bsr1_v2.support_requests where tenant_id=t.id and status in ('open','in_progress')),'knowledgeCount',(select count(*) from bsr1_v2.knowledge_items where tenant_id=t.id and active),'usagePercent',least(100,(select count(*) from bsr1_v2.conversations where tenant_id=t.id and created_at>=date_trunc('month',now()))));
  elsif p_action='knowledge.list' then
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into result from (select id,title,content,active,created_at from bsr1_v2.knowledge_items where tenant_id=t.id order by created_at desc) x; return result;
  elsif p_action='knowledge.create' then
    if char_length(trim(p_payload->>'title'))<2 or char_length(trim(p_payload->>'content'))<2 then raise exception 'invalid_input' using errcode='22023'; end if;
    insert into bsr1_v2.knowledge_items(tenant_id,title,content) values(t.id,left(trim(p_payload->>'title'),160),left(trim(p_payload->>'content'),4000)) returning id into item_id;
    insert into bsr1_v2.audit_events(tenant_id,action,object_type,object_id) values(t.id,'create','knowledge',item_id::text); return jsonb_build_object('ok',true,'id',item_id);
  elsif p_action='knowledge.delete' then
    delete from bsr1_v2.knowledge_items where id=(p_payload->>'id')::uuid and tenant_id=t.id returning id into item_id; if item_id is null then raise exception 'not_found' using errcode='P0002'; end if; return jsonb_build_object('ok',true);
  elsif p_action='assistant.ask' then
    if char_length(trim(p_payload->>'question'))<2 then raise exception 'invalid_input' using errcode='22023'; end if;
    select x.* into k from bsr1_v2.knowledge_items x where x.tenant_id=t.id and x.active and exists(select 1 from regexp_split_to_table(lower(trim(p_payload->>'question')),E'\\s+') w where char_length(w)>2 and (lower(x.title) like '%'||w||'%' or lower(x.content) like '%'||w||'%')) order by x.created_at desc limit 1;
    if k.id is null then k.content:='لم أجد إجابة معتمدة في قاعدة المعرفة. تم تسجيل السؤال لمراجعته.'; k.title:='بحاجة إلى مراجعة'; end if;
    insert into bsr1_v2.conversations(tenant_id,question,answer,source_knowledge_id) values(t.id,left(trim(p_payload->>'question'),500),k.content,k.id);
    return jsonb_build_object('answer',k.content,'source',k.title);
  elsif p_action='support.list' then
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into result from (select id,subject,details,status,created_at,updated_at from bsr1_v2.support_requests where tenant_id=t.id order by created_at desc) x; return result;
  elsif p_action='support.create' then
    if char_length(trim(p_payload->>'subject'))<2 then raise exception 'invalid_input' using errcode='22023'; end if;
    insert into bsr1_v2.support_requests(tenant_id,subject,details) values(t.id,left(trim(p_payload->>'subject'),160),left(coalesce(trim(p_payload->>'details'),''),2000)) returning id into item_id; return jsonb_build_object('ok',true,'id',item_id);
  elsif p_action='support.update' then
    new_status=p_payload->>'status'; if new_status not in ('open','in_progress','resolved','closed') then raise exception 'invalid_status' using errcode='22023'; end if;
    update bsr1_v2.support_requests set status=new_status,updated_at=now() where id=(p_payload->>'id')::uuid and tenant_id=t.id returning id into item_id; if item_id is null then raise exception 'not_found' using errcode='P0002'; end if; return jsonb_build_object('ok',true);
  elsif p_action='settings.get' then
    select jsonb_build_object('businessName',business_name,'welcomeMessage',welcome_message,'language',language) into result from bsr1_v2.client_settings where tenant_id=t.id; return coalesce(result,'{}'::jsonb);
  elsif p_action='settings.update' then
    insert into bsr1_v2.client_settings(tenant_id,business_name,welcome_message,language) values(t.id,left(trim(p_payload->>'businessName'),120),left(trim(p_payload->>'welcomeMessage'),500),case when p_payload->>'language'='en' then 'en' else 'ar' end) on conflict(tenant_id) do update set business_name=excluded.business_name,welcome_message=excluded.welcome_message,language=excluded.language,updated_at=now(); return jsonb_build_object('ok',true);
  elsif p_action='admin.overview' then
    return jsonb_build_object('tenants',(select count(*) from bsr1_v2.tenants),'knowledge',(select count(*) from bsr1_v2.knowledge_items),'openSupport',(select count(*) from bsr1_v2.support_requests where status in ('open','in_progress')),'conversations',(select count(*) from bsr1_v2.conversations));
  elsif p_action='admin.tenants' then
    select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into result from (select t.name,t.slug,t.status,coalesce(s.plan,'preview') plan from bsr1_v2.tenants t left join bsr1_v2.client_settings s on s.tenant_id=t.id order by t.created_at) x; return result;
  end if; raise exception 'invalid_action' using errcode='22023';
end;$$;
revoke all on function public.bsr1_v2_product_api(text,text,text,jsonb) from public,authenticated;
grant execute on function public.bsr1_v2_product_api(text,text,text,jsonb) to anon;
