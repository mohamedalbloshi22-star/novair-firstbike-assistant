-- NSR-1 V12: performance indexes for foreign-key access paths
-- Safe additive indexes; no data changes.

create index if not exists contact_requests_conversation_id_idx
  on public.contact_requests(conversation_id);

create index if not exists nsr_client_subscriptions_plan_code_idx
  on public.nsr_client_subscriptions(plan_code);

create index if not exists nsr_subscription_events_client_id_idx
  on public.nsr_subscription_events(client_id);

create index if not exists unanswered_questions_conversation_id_idx
  on public.unanswered_questions(conversation_id);
