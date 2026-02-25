-- Fix multi-tenant uniqueness for OFX/account imports
-- 1) Account names must be unique per user (not globally)
ALTER TABLE public.accounts
DROP CONSTRAINT IF EXISTS accounts_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_name
ON public.accounts (user_id, name);

-- 2) OFX fit_id must be unique per user (not globally)
DROP INDEX IF EXISTS public.idx_transactions_fit_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_fit_id
ON public.transactions (user_id, fit_id)
WHERE fit_id IS NOT NULL AND user_id IS NOT NULL;