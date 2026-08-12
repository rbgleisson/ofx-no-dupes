DROP INDEX IF EXISTS public.idx_transactions_user_fit_id;
CREATE INDEX IF NOT EXISTS idx_transactions_user_fit_id ON public.transactions (user_id, fit_id) WHERE fit_id IS NOT NULL;