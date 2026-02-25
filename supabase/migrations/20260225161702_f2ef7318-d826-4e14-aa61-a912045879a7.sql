
-- Create accounts table
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accounts are publicly readable" ON public.accounts FOR SELECT USING (true);
CREATE POLICY "Accounts are publicly insertable" ON public.accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Accounts are publicly updatable" ON public.accounts FOR UPDATE USING (true);
CREATE POLICY "Accounts are publicly deletable" ON public.accounts FOR DELETE USING (true);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fit_id TEXT,
  type TEXT,
  date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  memo TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transactions are publicly readable" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Transactions are publicly insertable" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Transactions are publicly updatable" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "Transactions are publicly deletable" ON public.transactions FOR DELETE USING (true);

-- Create unique index to prevent duplicate imports
CREATE UNIQUE INDEX idx_transactions_fit_id ON public.transactions(fit_id) WHERE fit_id IS NOT NULL;

-- Create index for date filtering
CREATE INDEX idx_transactions_date ON public.transactions(date);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
