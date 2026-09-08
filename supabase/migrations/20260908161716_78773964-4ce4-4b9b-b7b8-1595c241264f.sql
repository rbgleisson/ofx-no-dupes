ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS accountant_email text,
  ADD COLUMN IF NOT EXISTS accountant_columns jsonb;