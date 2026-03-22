CREATE POLICY "Anyone can update transaction docs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'transaction-docs')
WITH CHECK (bucket_id = 'transaction-docs');