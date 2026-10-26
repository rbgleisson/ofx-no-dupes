CREATE TABLE public.month_closures (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 year integer NOT NULL CHECK (year BETWEEN 1 AND 9999),
 month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
 closed_by uuid NOT NULL,
 closed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, year, month)
);
GRANT SELECT ON public.month_closures TO authenticated;
GRANT ALL ON public.month_closures TO service_role;
ALTER TABLE public.month_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own month closures" ON public.month_closures FOR SELECT TO authenticated USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE FUNCTION public.set_month_closed(_organization_id uuid, _year integer, _month integer, _closed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE closer uuid;
BEGIN
 IF auth.uid() IS NULL OR _organization_id IS DISTINCT FROM public.get_user_org_id(auth.uid()) THEN RAISE EXCEPTION 'Organização não autorizada.' USING ERRCODE='42501'; END IF;
 IF _year NOT BETWEEN 1 AND 9999 OR _month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Período inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_organization_id::text, 781));
 SELECT closed_by INTO closer FROM public.month_closures WHERE organization_id=_organization_id AND year=_year AND month=_month FOR UPDATE;
 IF _closed THEN
  IF closer IS NOT NULL THEN RAISE EXCEPTION 'Este mês já está fechado.'; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND is_active AND can_edit_transactions)) THEN RAISE EXCEPTION 'Sem permissão para fechar o mês.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.month_closures(organization_id,year,month,closed_by) VALUES (_organization_id,_year,_month,auth.uid());
 ELSE
  IF closer IS NULL THEN RAISE EXCEPTION 'Este mês já está aberto.'; END IF;
  IF closer IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Somente quem fechou este mês pode liberá-lo.' USING ERRCODE='42501'; END IF;
  DELETE FROM public.month_closures WHERE organization_id=_organization_id AND year=_year AND month=_month;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_month_closed(uuid,integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_month_closed(uuid,integer,integer,boolean) TO authenticated;

CREATE FUNCTION public.assert_financial_month_open(_org uuid, _date date, _historical boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF _org IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(_org::text,781));
 IF EXISTS (SELECT 1 FROM public.month_closures c WHERE c.organization_id=_org AND
  CASE WHEN _historical THEN (_date IS NULL OR make_date(c.year,c.month,1)+interval '1 month' > _date)
  ELSE c.year=extract(year FROM _date)::integer AND c.month=extract(month FROM _date)::integer END) THEN
  RAISE EXCEPTION 'Mês fechado com a contabilidade. Somente quem fechou pode liberá-lo antes de alterar os dados.' USING ERRCODE='P0001';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_financial_month_open(uuid,date,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_closed_financial_month() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; d date; historical boolean;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(CASE TG_OP WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW)) WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD)) ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
  historical := TG_TABLE_NAME IN ('monthly_opening_balances','account_statement_balances','accounts');
  IF TG_TABLE_NAME IN ('monthly_opening_balances','investment_positions') THEN d:=make_date((r->>'year')::integer,(r->>'month')::integer,1);
  ELSIF TG_TABLE_NAME='account_statement_balances' THEN d:=(r->>'balance_date')::date;
  ELSIF TG_TABLE_NAME='accounts' THEN
   IF TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['name','color','created_at']) = (to_jsonb(NEW)-ARRAY['name','color','created_at']) THEN CONTINUE; END IF;
   d:=(r->>'opening_balance_date')::date;
  ELSIF TG_TABLE_NAME='installments' THEN
   d:=(r->>'due_date')::date;
   PERFORM public.assert_financial_month_open((r->>'organization_id')::uuid,(r->>'paid_at')::timestamptz AT TIME ZONE 'UTC',false);
  ELSE d:=(r->>'date')::date;
  END IF;
  PERFORM public.assert_financial_month_open((r->>'organization_id')::uuid,d,historical);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_financial_month() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_closed_financial_month();
CREATE TRIGGER protect_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.monthly_opening_balances FOR EACH ROW EXECUTE FUNCTION public.guard_closed_financial_month();
CREATE TRIGGER protect_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.investment_positions FOR EACH ROW EXECUTE FUNCTION public.guard_closed_financial_month();
CREATE TRIGGER protect_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.account_statement_balances FOR EACH ROW EXECUTE FUNCTION public.guard_closed_financial_month();
CREATE TRIGGER protect_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.guard_closed_financial_month();
CREATE TRIGGER protect_closed_month BEFORE INSERT OR UPDATE OR DELETE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.guard_closed_financial_month();

CREATE FUNCTION public.guard_closed_month_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(OLD.organization_id::text,781));
 IF EXISTS (SELECT 1 FROM public.transactions t JOIN public.month_closures c ON c.organization_id=t.organization_id AND c.year=extract(year FROM t.date)::integer AND c.month=extract(month FROM t.date)::integer WHERE t.organization_id=OLD.organization_id AND CASE WHEN TG_TABLE_NAME='categories' THEN t.category_id=OLD.id ELSE t.chart_account_id=OLD.id END) THEN
  RAISE EXCEPTION 'Cadastro utilizado em mês fechado. Libere o mês antes de alterar ou excluir.';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_closed_month_catalog() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_closed_month_catalog BEFORE UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.guard_closed_month_catalog();
CREATE TRIGGER protect_closed_month_catalog BEFORE UPDATE OR DELETE ON public.chart_accounts FOR EACH ROW EXECUTE FUNCTION public.guard_closed_month_catalog();

CREATE FUNCTION public.set_installment_paid(_id uuid,_paid boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.installments; txid uuid; org uuid;
BEGIN
 org:=public.get_user_org_id(auth.uid());
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(org::text,781));
 SELECT * INTO item FROM public.installments WHERE id=_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
 IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND is_active AND can_edit_transactions AND (NOT _paid OR can_create_transactions) AND (_paid OR can_delete_transactions))) THEN RAISE EXCEPTION 'Sem permissão para alterar a parcela.' USING ERRCODE='42501'; END IF;
 IF item.is_paid=_paid THEN RETURN; END IF;
 IF _paid THEN
  INSERT INTO public.transactions(organization_id,user_id,date,amount,description,category_id,account_id,memo) VALUES(org,auth.uid(),(now() AT TIME ZONE 'UTC')::date,CASE WHEN item.type='payable' THEN -abs(item.amount) ELSE abs(item.amount) END,item.description||' ('||item.installment_number||'/'||item.total_installments||')',item.category_id,item.account_id,CASE WHEN item.invoice_number IS NOT NULL THEN 'NF: '||item.invoice_number END) RETURNING id INTO txid;
  UPDATE public.installments SET is_paid=true,paid_at=now(),transaction_id=txid WHERE id=_id;
 ELSE
  IF item.transaction_id IS NOT NULL THEN DELETE FROM public.transactions WHERE id=item.transaction_id AND organization_id=org; END IF;
  UPDATE public.installments SET is_paid=false,paid_at=null,transaction_id=null WHERE id=_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_installment_paid(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_installment_paid(uuid,boolean) TO authenticated;