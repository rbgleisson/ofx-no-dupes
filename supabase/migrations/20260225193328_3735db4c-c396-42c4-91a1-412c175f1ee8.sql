
-- Add user_id to all tables
ALTER TABLE public.accounts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chart_accounts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Accounts are publicly deletable" ON public.accounts;
DROP POLICY IF EXISTS "Accounts are publicly insertable" ON public.accounts;
DROP POLICY IF EXISTS "Accounts are publicly readable" ON public.accounts;
DROP POLICY IF EXISTS "Accounts are publicly updatable" ON public.accounts;

DROP POLICY IF EXISTS "Categories are publicly deletable" ON public.categories;
DROP POLICY IF EXISTS "Categories are publicly insertable" ON public.categories;
DROP POLICY IF EXISTS "Categories are publicly readable" ON public.categories;
DROP POLICY IF EXISTS "Categories are publicly updatable" ON public.categories;

DROP POLICY IF EXISTS "Chart accounts are publicly deletable" ON public.chart_accounts;
DROP POLICY IF EXISTS "Chart accounts are publicly insertable" ON public.chart_accounts;
DROP POLICY IF EXISTS "Chart accounts are publicly readable" ON public.chart_accounts;
DROP POLICY IF EXISTS "Chart accounts are publicly updatable" ON public.chart_accounts;

DROP POLICY IF EXISTS "Transactions are publicly deletable" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are publicly insertable" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are publicly readable" ON public.transactions;
DROP POLICY IF EXISTS "Transactions are publicly updatable" ON public.transactions;

-- Create user-scoped RLS policies for accounts
CREATE POLICY "Users can view own accounts" ON public.accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON public.accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON public.accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON public.accounts FOR DELETE USING (auth.uid() = user_id);

-- Create user-scoped RLS policies for categories
CREATE POLICY "Users can view own categories" ON public.categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON public.categories FOR DELETE USING (auth.uid() = user_id);

-- Create user-scoped RLS policies for chart_accounts
CREATE POLICY "Users can view own chart_accounts" ON public.chart_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chart_accounts" ON public.chart_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chart_accounts" ON public.chart_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chart_accounts" ON public.chart_accounts FOR DELETE USING (auth.uid() = user_id);

-- Create user-scoped RLS policies for transactions
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);
