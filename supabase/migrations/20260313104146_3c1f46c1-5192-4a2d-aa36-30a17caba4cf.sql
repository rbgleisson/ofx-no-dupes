ALTER TABLE public.chart_accounts DROP CONSTRAINT IF EXISTS chart_accounts_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS chart_accounts_code_user_id_key ON public.chart_accounts (code, user_id);