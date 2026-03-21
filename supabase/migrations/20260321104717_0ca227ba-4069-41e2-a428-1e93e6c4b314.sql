
-- Helper function to get user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Helper function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

-- Helper function to check if user is owner of an org
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = _org_id AND owner_id = _user_id
  );
$$;

-- ==========================================
-- RLS POLICIES FOR organizations
-- ==========================================
CREATE POLICY "Super admins can do everything on orgs"
  ON public.organizations FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners can view own org"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Members can view own org"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (id = public.get_user_org_id(auth.uid()));

-- ==========================================
-- RLS POLICIES FOR profiles
-- ==========================================
CREATE POLICY "Super admins can do everything on profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owners can view org profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Owners can manage org profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND public.is_org_owner(auth.uid(), organization_id)
  )
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND public.is_org_owner(auth.uid(), organization_id)
  );

-- ==========================================
-- UPDATE EXISTING RLS POLICIES on data tables
-- ==========================================

-- TRANSACTIONS: Drop old policies and create org-scoped ones
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

CREATE POLICY "Org members can view transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org members can insert transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org members can update transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org members can delete transactions"
  ON public.transactions FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- CATEGORIES
DROP POLICY IF EXISTS "Users can view own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;

CREATE POLICY "Org members can view categories"
  ON public.categories FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can insert categories"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can update categories"
  ON public.categories FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can delete categories"
  ON public.categories FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- ACCOUNTS
DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can insert own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;

CREATE POLICY "Org members can view accounts"
  ON public.accounts FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can insert accounts"
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can update accounts"
  ON public.accounts FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can delete accounts"
  ON public.accounts FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- CHART_ACCOUNTS
DROP POLICY IF EXISTS "Users can view own chart_accounts" ON public.chart_accounts;
DROP POLICY IF EXISTS "Users can insert own chart_accounts" ON public.chart_accounts;
DROP POLICY IF EXISTS "Users can update own chart_accounts" ON public.chart_accounts;
DROP POLICY IF EXISTS "Users can delete own chart_accounts" ON public.chart_accounts;

CREATE POLICY "Org members can view chart_accounts"
  ON public.chart_accounts FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can insert chart_accounts"
  ON public.chart_accounts FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can update chart_accounts"
  ON public.chart_accounts FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Org members can delete chart_accounts"
  ON public.chart_accounts FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- USER_PERMISSIONS - update policies
DROP POLICY IF EXISTS "Admins can manage all permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_permissions;

CREATE POLICY "Super admins can manage all permissions"
  ON public.user_permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners can manage org permissions"
  ON public.user_permissions FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND public.is_org_owner(auth.uid(), organization_id)
  )
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND public.is_org_owner(auth.uid(), organization_id)
  );

CREATE POLICY "Users can view own permissions"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- AUTHORIZED_EMAILS - update policies
DROP POLICY IF EXISTS "Admins can manage authorized_emails" ON public.authorized_emails;

CREATE POLICY "Super admins can manage all authorized_emails"
  ON public.authorized_emails FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners can manage org authorized_emails"
  ON public.authorized_emails FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND public.has_role(auth.uid(), 'owner')
  )
  WITH CHECK (
    organization_id = public.get_user_org_id(auth.uid())
    AND public.has_role(auth.uid(), 'owner')
  );

-- USER_ROLES - update policies  
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Owners can view org member roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.organization_id = public.get_user_org_id(auth.uid())
    )
    AND public.has_role(auth.uid(), 'owner')
  );

-- Update list_all_users to be org-aware
CREATE OR REPLACE FUNCTION public.list_org_users(_org_id uuid)
RETURNS TABLE(id uuid, email text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id, au.email::text, au.created_at
  FROM auth.users au
  INNER JOIN public.profiles p ON p.user_id = au.id
  WHERE p.organization_id = _org_id
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_org_owner(auth.uid(), _org_id)
    );
$$;

-- Update get_user_permissions to work with org context
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(p) FROM public.user_permissions p WHERE p.user_id = _user_id;
$$;

-- Trigger to auto-create profile when user is created via manage-users
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profile creation is handled by the edge function
  RETURN NEW;
END;
$$;
