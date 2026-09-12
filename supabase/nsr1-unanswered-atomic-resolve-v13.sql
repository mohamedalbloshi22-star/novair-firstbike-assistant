-- NSR-1 V13: atomically resolve unanswered questions and update tenant knowledge.
-- Keeps knowledge creation/update and unanswered resolution in one database transaction.

create or replace function public.nsr_resolve_unanswered_question(
  p_client_id uuid,
  p_question_id uuid,
  p_answer text,
  p_language text,
  p_source text default 'client_portal'
)
returns table(
  question_id uuid,
  knowledge_id uuid,
  knowledge_action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question text;
  v_resolved boolean;
  v_knowledge_id uuid;
  v_action text;
  v_answer text := trim(coalesce(p_answer,''));
  v_language text := case when p_language='en' then 'en' else 'ar' end;
  v_source text := case when p_source='admin' then 'admin' else 'client_portal' end;
begin
  if p_client_id is null or p_question_id is null then
    raise exception 'client and question are required';
  end if;
  if v_answer='' then
    raise exception 'approved answer is required';
  end if;
  if length(v_answer)>6000 then
    raise exception 'approved answer is too long';
  end if;

  select q.question, coalesce(q.resolved,false)
    into v_question, v_resolved
  from public.unanswered_questions q
  where q.id=p_question_id
    and q.client_id=p_client_id
  for update;

  if not found then
    raise exception 'question not found';
  end if;
  if v_resolved then
    raise exception 'question already resolved';
  end if;

  select k.id into v_knowledge_id
  from public.knowledge_base k
  where k.client_id=p_client_id
    and k.question=v_question
  order by k.updated_at desc nulls last, k.created_at desc
  limit 1
  for update;

  if v_knowledge_id is not null then
    update public.knowledge_base
    set answer=v_answer,
        language=v_language,
        active=true,
        updated_at=now()
    where id=v_knowledge_id
      and client_id=p_client_id;
    v_action := 'updated';
  else
    insert into public.knowledge_base(client_id,question,answer,language,source,active)
    values(p_client_id,v_question,v_answer,v_language,v_source,true)
    returning id into v_knowledge_id;
    v_action := 'created';
  end if;

  update public.unanswered_questions
  set approved_answer=v_answer,
      resolved=true,
      resolved_at=now()
  where id=p_question_id
    and client_id=p_client_id;

  return query select p_question_id,v_knowledge_id,v_action;
end;
$$;

revoke all on function public.nsr_resolve_unanswered_question(uuid,uuid,text,text,text) from PUBLIC, anon, authenticated;
grant execute on function public.nsr_resolve_unanswered_question(uuid,uuid,text,text,text) to service_role;
