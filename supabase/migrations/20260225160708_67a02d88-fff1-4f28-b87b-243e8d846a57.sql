
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly readable" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Categories are publicly insertable" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Categories are publicly updatable" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Categories are publicly deletable" ON public.categories FOR DELETE USING (true);
