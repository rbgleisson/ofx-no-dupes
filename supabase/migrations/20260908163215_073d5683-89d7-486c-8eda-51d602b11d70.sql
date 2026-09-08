CREATE TABLE public.investment_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 1900 AND 3000),
  saldo_anterior numeric NOT NULL DEFAULT 0,
  saldo_atual numeric NOT NULL DEFAULT 0,
  rendimento_mes numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (account_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_positions TO authenticated;
GRANT ALL ON public.investment_positions TO service_role;

ALTER TABLE public.investment_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view investment positions"
ON public.investment_positions FOR SELECT TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can insert investment positions"
ON public.investment_positions FOR INSERT TO authenticated
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can update investment positions"
ON public.investment_positions FOR UPDATE TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can delete investment positions"
ON public.investment_positions FOR DELETE TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE INDEX idx_investment_positions_org_period ON public.investment_positions (organization_id, year, month);

CREATE TRIGGER update_investment_positions_updated_at
BEFORE UPDATE ON public.investment_positions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();