REVOKE EXECUTE ON FUNCTION public.get_master_org_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_master_org_id() TO authenticated;