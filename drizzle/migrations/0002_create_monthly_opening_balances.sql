CREATE TABLE public.monthly_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 1900 AND 3000),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_opening_balances TO authenticated;
GRANT ALL ON public.monthly_opening_balances TO service_role;

ALTER TABLE public.monthly_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own organization monthly opening balances"
ON public.monthly_opening_balances
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can create own organization monthly opening balances"
ON public.monthly_opening_balances
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update own organization monthly opening balances"
ON public.monthly_opening_balances
FOR UPDATE
TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete own organization monthly opening balances"
ON public.monthly_opening_balances
FOR DELETE
TO authenticated
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER update_monthly_opening_balances_updated_at
BEFORE UPDATE ON public.monthly_opening_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();