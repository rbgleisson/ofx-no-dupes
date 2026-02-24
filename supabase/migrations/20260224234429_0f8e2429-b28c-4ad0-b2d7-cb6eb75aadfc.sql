
-- Create storage bucket for transaction documents
INSERT INTO storage.buckets (id, name, public) VALUES ('transaction-docs', 'transaction-docs', true);

-- Allow anyone to upload files (no auth required for this app)
CREATE POLICY "Anyone can upload transaction docs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'transaction-docs');

-- Allow anyone to view transaction docs
CREATE POLICY "Anyone can view transaction docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'transaction-docs');

-- Allow anyone to delete transaction docs
CREATE POLICY "Anyone can delete transaction docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'transaction-docs');
