-- NSR-1 V12: restrict execution of RLS auto-enable event trigger function.
-- The function is invoked internally by PostgreSQL event trigger ensure_rls;
-- it must not be callable through PostgREST by anon/authenticated users.

revoke all on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;
