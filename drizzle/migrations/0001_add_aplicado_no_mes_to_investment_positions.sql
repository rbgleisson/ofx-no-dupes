ALTER TABLE public.investment_positions
ADD COLUMN IF NOT EXISTS aplicado_no_mes numeric NOT NULL DEFAULT 0;