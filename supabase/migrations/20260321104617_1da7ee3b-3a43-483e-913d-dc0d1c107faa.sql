
-- 1. Update app_role enum to add 'super_admin' and 'owner'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
