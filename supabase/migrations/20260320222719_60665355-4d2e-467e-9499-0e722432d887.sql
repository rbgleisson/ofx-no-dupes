
CREATE TABLE public.authorized_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage authorized_emails"
ON public.authorized_emails
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_email_authorized(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_emails WHERE lower(email) = lower(_email)
  )
$$;
