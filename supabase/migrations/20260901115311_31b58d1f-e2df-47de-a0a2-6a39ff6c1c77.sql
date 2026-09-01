REVOKE ALL ON FUNCTION public.can_access_transaction_doc(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_transaction_doc(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_transaction_doc(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_transaction_doc(text) TO service_role;