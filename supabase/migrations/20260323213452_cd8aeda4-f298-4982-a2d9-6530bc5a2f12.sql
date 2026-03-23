-- Create organization for second user
INSERT INTO public.organizations (id, name, owner_id)
VALUES (gen_random_uuid(), 'Tesouraria Geral VDP', 'ecc2975e-2657-4629-82d9-4077656ef421');

-- Create profile linking user to their org
INSERT INTO public.profiles (user_id, organization_id)
SELECT 'ecc2975e-2657-4629-82d9-4077656ef421', id
FROM public.organizations
WHERE owner_id = 'ecc2975e-2657-4629-82d9-4077656ef421';

-- Add owner role
INSERT INTO public.user_roles (user_id, role)
VALUES ('ecc2975e-2657-4629-82d9-4077656ef421', 'owner')
ON CONFLICT (user_id, role) DO NOTHING;

-- Add user permissions
INSERT INTO public.user_permissions (user_id, organization_id)
SELECT 'ecc2975e-2657-4629-82d9-4077656ef421', id
FROM public.organizations
WHERE owner_id = 'ecc2975e-2657-4629-82d9-4077656ef421'
ON CONFLICT (user_id) DO NOTHING;

-- Update existing authorized email with org id
UPDATE public.authorized_emails
SET organization_id = (SELECT id FROM public.organizations WHERE owner_id = 'ecc2975e-2657-4629-82d9-4077656ef421')
WHERE lower(email) = 'tesourariageral.vdp@gmail.com';