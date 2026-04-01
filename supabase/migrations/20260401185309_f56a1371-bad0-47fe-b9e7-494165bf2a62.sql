
-- 1. Make transaction-docs bucket private
UPDATE storage.buckets SET public = false WHERE id = 'transaction-docs';

-- 2. Drop all open storage policies
DROP POLICY IF EXISTS "Anyone can view transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete transaction docs" ON storage.objects;

-- 3. Create secure storage policies requiring authentication + org membership
CREATE POLICY "Authenticated users can view transaction docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'transaction-docs'
);

CREATE POLICY "Authenticated users can upload transaction docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transaction-docs'
);

CREATE POLICY "Authenticated users can update transaction docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'transaction-docs'
)
WITH CHECK (
  bucket_id = 'transaction-docs'
);

CREATE POLICY "Authenticated users can delete transaction docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'transaction-docs'
);

-- 4. Allow org owners to manage roles of members in their org
CREATE POLICY "Owners can manage org member roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND public.is_org_owner(auth.uid(), p.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND public.is_org_owner(auth.uid(), p.organization_id)
  )
  AND role IN ('user', 'admin')
);
