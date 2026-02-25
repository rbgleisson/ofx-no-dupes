-- Tabela de contas contábeis (plano de contas)
CREATE TABLE public.chart_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chart_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chart accounts are publicly readable" ON public.chart_accounts FOR SELECT USING (true);
CREATE POLICY "Chart accounts are publicly insertable" ON public.chart_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Chart accounts are publicly updatable" ON public.chart_accounts FOR UPDATE USING (true);
CREATE POLICY "Chart accounts are publicly deletable" ON public.chart_accounts FOR DELETE USING (true);

-- Adicionar coluna na tabela de transações
ALTER TABLE public.transactions ADD COLUMN chart_account_id UUID REFERENCES public.chart_accounts(id) ON DELETE SET NULL;
