-- Consolidação das políticas do bucket de anexos
DROP POLICY IF EXISTS "Allow public read access on transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates on transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes on transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete transaction docs" ON storage.objects;

-- Um objeto pertence à organização do usuário quando:
--   (a) a primeira pasta é o organization_id do usuário (padrão novo), ou
--   (b) a primeira pasta é o id de um lançamento da organização (caminhos legados).
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
      WHERE t.id::text = (storage.foldername(_name))[1]
        AND t.organization_id = public.get_user_org_id(auth.uid())
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_transaction_doc(text) FROM anon;

CREATE POLICY "Org members can read transaction docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'transaction-docs' AND public.can_access_transaction_doc(name));

CREATE POLICY "Org members can upload transaction docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'transaction-docs' AND public.can_access_transaction_doc(name));

CREATE POLICY "Org members can update transaction docs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'transaction-docs' AND public.can_access_transaction_doc(name))
WITH CHECK (bucket_id = 'transaction-docs' AND public.can_access_transaction_doc(name));

CREATE POLICY "Org members can delete transaction docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'transaction-docs' AND public.can_access_transaction_doc(name));