ALTER TABLE public.attachment_links
  ALTER COLUMN attachment_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES public.chart_accounts(id) ON DELETE SET NULL;

INSERT INTO public.attachment_links (organization_id, account_id, fit_id, attachment_url, category_id, chart_account_id)
SELECT DISTINCT ON (t.organization_id, t.fit_id, COALESCE(t.account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  t.organization_id, t.account_id, t.fit_id, t.attachment_url, t.category_id, t.chart_account_id
FROM public.transactions t
WHERE t.fit_id IS NOT NULL
  AND t.organization_id IS NOT NULL
  AND (t.attachment_url IS NOT NULL OR t.category_id IS NOT NULL OR t.chart_account_id IS NOT NULL)
ORDER BY t.organization_id, t.fit_id, COALESCE(t.account_id, '00000000-0000-0000-0000-000000000000'::uuid), t.updated_at DESC
ON CONFLICT (organization_id, fit_id, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET
  attachment_url = COALESCE(public.attachment_links.attachment_url, EXCLUDED.attachment_url),
  category_id = COALESCE(public.attachment_links.category_id, EXCLUDED.category_id),
  chart_account_id = COALESCE(public.attachment_links.chart_account_id, EXCLUDED.chart_account_id);