ALTER TABLE public.month_closures ADD COLUMN closed_month_balance numeric, ADD COLUMN closed_total_with_investments numeric;

CREATE FUNCTION public.close_month_with_snapshot(_organization_id uuid, _year integer, _month integer, _month_balance numeric, _total_with_investments numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 PERFORM public.set_month_closed(_organization_id, _year, _month, true);
 UPDATE public.month_closures SET closed_month_balance = round(_month_balance, 2), closed_total_with_investments = round(_total_with_investments, 2)
  WHERE organization_id = _organization_id AND year = _year AND month = _month AND closed_by = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.close_month_with_snapshot(uuid,integer,integer,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_month_with_snapshot(uuid,integer,integer,numeric,numeric) TO authenticated;

CREATE FUNCTION public.get_org_member_label(_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT COALESCE(NULLIF(p.display_name, ''), u.email::text)
 FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
 WHERE u.id = _user_id AND auth.uid() IS NOT NULL
   AND public.get_user_org_id(_user_id) = public.get_user_org_id(auth.uid())
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_org_member_label(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_member_label(uuid) TO authenticated;