
-- Create installments table
CREATE TABLE public.installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID,
  group_id UUID NOT NULL DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  invoice_number TEXT,
  type TEXT NOT NULL DEFAULT 'payable' CHECK (type IN ('payable', 'receivable')),
  installment_number INTEGER NOT NULL DEFAULT 1,
  total_installments INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org members can view installments"
ON public.installments FOR SELECT TO authenticated
USING ((organization_id = get_user_org_id(auth.uid())) OR is_super_admin(auth.uid()));

CREATE POLICY "Org members can insert installments"
ON public.installments FOR INSERT TO authenticated
WITH CHECK ((organization_id = get_user_org_id(auth.uid())) OR is_super_admin(auth.uid()));

CREATE POLICY "Org members can update installments"
ON public.installments FOR UPDATE TO authenticated
USING ((organization_id = get_user_org_id(auth.uid())) OR is_super_admin(auth.uid()));

CREATE POLICY "Org members can delete installments"
ON public.installments FOR DELETE TO authenticated
USING ((organization_id = get_user_org_id(auth.uid())) OR is_super_admin(auth.uid()));

-- Indexes
CREATE INDEX idx_installments_org ON public.installments(organization_id);
CREATE INDEX idx_installments_group ON public.installments(group_id);
CREATE INDEX idx_installments_due_date ON public.installments(due_date);
CREATE INDEX idx_installments_type ON public.installments(type);

-- Updated_at trigger
CREATE TRIGGER update_installments_updated_at
BEFORE UPDATE ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
