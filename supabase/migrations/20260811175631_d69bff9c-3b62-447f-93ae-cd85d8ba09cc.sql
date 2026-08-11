CREATE TABLE public.attachment_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  fit_id text NOT NULL,
  attachment_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachment_links TO authenticated;
GRANT ALL ON public.attachment_links TO service_role;

ALTER TABLE public.attachment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage attachment links"
ON public.attachment_links FOR ALL TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE UNIQUE INDEX attachment_links_unique_key
ON public.attachment_links (organization_id, fit_id, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER update_attachment_links_updated_at
BEFORE UPDATE ON public.attachment_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.attachment_links (organization_id, account_id, fit_id, attachment_url)
SELECT DISTINCT ON (t.organization_id, t.fit_id, COALESCE(t.account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  t.organization_id, t.account_id, t.fit_id, t.attachment_url
FROM public.transactions t
WHERE t.attachment_url IS NOT NULL AND t.fit_id IS NOT NULL AND t.organization_id IS NOT NULL
ORDER BY t.organization_id, t.fit_id, COALESCE(t.account_id, '00000000-0000-0000-0000-000000000000'::uuid), t.updated_at DESC;