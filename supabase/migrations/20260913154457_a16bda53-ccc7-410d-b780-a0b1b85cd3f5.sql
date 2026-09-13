-- Revoke public/anon execute on all security definer + helper functions
REVOKE ALL ON FUNCTION public.can_access_transaction_doc(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_upload_transaction_doc(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_master_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_org_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_email_authorized(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_all_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_org_users(uuid) FROM PUBLIC, anon;

-- Trigger functions: no end-user execution at all
REVOKE ALL ON FUNCTION public.handle_new_user_permissions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Grant back only to authenticated / service_role where the app needs it
GRANT EXECUTE ON FUNCTION public.can_access_transaction_doc(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_transaction_doc(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_master_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_org_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_all_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_org_users(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_email_authorized(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_permissions() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;