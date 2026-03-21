
-- 2. Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  plan_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Add organization_id to all data tables
ALTER TABLE public.transactions ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.accounts ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.chart_accounts ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_permissions ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.authorized_emails ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. Create a default organization for existing data and assign current admin as owner
INSERT INTO public.organizations (id, name, owner_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Padrão', '307c1c45-2a76-4755-b383-2f7be6134d77');

-- 6. Create profile for existing admin
INSERT INTO public.profiles (user_id, organization_id)
VALUES ('307c1c45-2a76-4755-b383-2f7be6134d77', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- 7. Migrate existing data to default org
UPDATE public.transactions SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.categories SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.accounts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.chart_accounts SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.user_permissions SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.authorized_emails SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

-- 8. Create profiles for all existing users who don't have one
INSERT INTO public.profiles (user_id, organization_id)
SELECT ur.user_id, '00000000-0000-0000-0000-000000000001'
FROM public.user_roles ur
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = ur.user_id);

-- 9. Set admin as super_admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('307c1c45-2a76-4755-b383-2f7be6134d77', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 10. Set admin as owner of default org
INSERT INTO public.user_roles (user_id, role)
VALUES ('307c1c45-2a76-4755-b383-2f7be6134d77', 'owner')
ON CONFLICT (user_id, role) DO NOTHING;
