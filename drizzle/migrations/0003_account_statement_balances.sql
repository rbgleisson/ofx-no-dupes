CREATE TABLE public.account_statement_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  balance_date date NOT NULL,
  balance numeric NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('ofx','manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, balance_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_statement_balances TO authenticated;
GRANT ALL ON public.account_statement_balances TO service_role;
ALTER TABLE public.account_statement_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org select statement balances" ON public.account_statement_balances FOR SELECT TO authenticated USING (organization_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Org insert statement balances" ON public.account_statement_balances FOR INSERT TO authenticated WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Org update statement balances" ON public.account_statement_balances FOR UPDATE TO authenticated USING (organization_id = public.get_user_org_id(auth.uid())) WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));
CREATE POLICY "Org delete statement balances" ON public.account_statement_balances FOR DELETE TO authenticated USING (organization_id = public.get_user_org_id(auth.uid()));