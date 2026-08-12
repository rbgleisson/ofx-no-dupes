CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  ip text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.login_attempts TO service_role;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to login attempts"
ON public.login_attempts FOR SELECT TO authenticated USING (false);

CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (lower(email), created_at DESC);