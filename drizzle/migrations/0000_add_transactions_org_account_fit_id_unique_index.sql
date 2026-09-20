CREATE UNIQUE INDEX IF NOT EXISTS transactions_org_account_fit_id_key
ON public.transactions (
  organization_id,
  COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
  fit_id
)
WHERE fit_id IS NOT NULL AND fit_id <> '';