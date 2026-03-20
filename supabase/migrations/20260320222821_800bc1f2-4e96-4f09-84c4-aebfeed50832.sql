
INSERT INTO public.authorized_emails (email)
SELECT au.email FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.authorized_emails ae WHERE lower(ae.email) = lower(au.email::text))
