CREATE OR REPLACE FUNCTION public.can_access_transaction_doc(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN (storage.foldername(_name))[1] = public.get_user_org_id(auth.uid())::text THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.organization_id = public.get_user_org_id(auth.uid())
        AND t.attachment_url LIKE '%' || _name
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_upload_transaction_doc(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (storage.foldername(_name))[1] = public.get_user_org_id(auth.uid())::text;
$$;

REVOKE ALL ON FUNCTION public.can_upload_transaction_doc(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_upload_transaction_doc(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_upload_transaction_doc(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_transaction_doc(text) TO service_role;

DROP POLICY IF EXISTS "Org members can upload transaction docs" ON storage.objects;
CREATE POLICY "Org members can upload transaction docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'transaction-docs' AND public.can_upload_transaction_doc(name));