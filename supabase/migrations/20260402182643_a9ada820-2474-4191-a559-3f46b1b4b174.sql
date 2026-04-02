
-- Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-docs', 'transaction-docs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access on transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes on transaction-docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates on transaction-docs" ON storage.objects;

-- Public read access
CREATE POLICY "Allow public read access on transaction-docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'transaction-docs');

-- Authenticated users can upload
CREATE POLICY "Allow authenticated uploads to transaction-docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'transaction-docs');

-- Authenticated users can update (needed for upsert)
CREATE POLICY "Allow authenticated updates on transaction-docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'transaction-docs');

-- Authenticated users can delete
CREATE POLICY "Allow authenticated deletes on transaction-docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'transaction-docs');
