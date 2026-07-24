-- 1) Opening balance on accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 2) History of manual adjustments on account balances
CREATE TABLE IF NOT EXISTS public.account_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  previous_balance NUMERIC(14,2) NOT NULL,
  new_balance NUMERIC(14,2) NOT NULL,
  delta NUMERIC(14,2) NOT NULL,
  note TEXT,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_adjustments TO authenticated;
GRANT ALL ON public.account_adjustments TO service_role;

ALTER TABLE public.account_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view account adjustments"
ON public.account_adjustments FOR SELECT
TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can insert account adjustments"
ON public.account_adjustments FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Org members can delete account adjustments"
ON public.account_adjustments FOR DELETE
TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_account_adjustments_account ON public.account_adjustments(account_id, created_at DESC);
