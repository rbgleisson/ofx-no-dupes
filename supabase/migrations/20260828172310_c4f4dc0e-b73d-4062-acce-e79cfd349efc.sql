CREATE OR REPLACE FUNCTION public.get_master_org_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM public.organizations o
  JOIN public.user_roles ur ON ur.user_id = o.owner_id AND ur.role = 'super_admin'
  ORDER BY o.created_at ASC
  LIMIT 1;
$$;

CREATE POLICY "All users can view master chart_accounts"
ON public.chart_accounts
FOR SELECT
TO authenticated
USING (organization_id = public.get_master_org_id());