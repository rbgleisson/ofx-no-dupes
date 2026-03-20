
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  can_import boolean NOT NULL DEFAULT true,
  can_export boolean NOT NULL DEFAULT true,
  can_backup boolean NOT NULL DEFAULT true,
  can_manage_categories boolean NOT NULL DEFAULT true,
  can_manage_accounts boolean NOT NULL DEFAULT true,
  can_manage_chart_accounts boolean NOT NULL DEFAULT true,
  can_create_transactions boolean NOT NULL DEFAULT true,
  can_edit_transactions boolean NOT NULL DEFAULT true,
  can_delete_transactions boolean NOT NULL DEFAULT true,
  can_view_totals boolean NOT NULL DEFAULT true,
  can_clear_all boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all permissions"
  ON public.user_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can read their own permissions
CREATE POLICY "Users can view own permissions"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create permissions on signup via function
CREATE OR REPLACE FUNCTION public.handle_new_user_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_permissions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_permissions
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_permissions();

-- Function to get user permissions safely
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(p) FROM public.user_permissions p WHERE p.user_id = _user_id;
$$;

-- Function to list all users (for admin panel)
CREATE OR REPLACE FUNCTION public.list_all_users()
RETURNS TABLE(id uuid, email text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id, au.email::text, au.created_at
  FROM auth.users au
  WHERE public.has_role(auth.uid(), 'admin');
$$;
