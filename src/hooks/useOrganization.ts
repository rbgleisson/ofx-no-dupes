import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  plan_status: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  organization_id: string;
  display_name: string | null;
}

interface OrganizationContextValue {
  organization: Organization | null;
  profile: UserProfile | null;
  organizationId: string | null;
  isOwner: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  reload: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue>({
  organization: null,
  profile: null,
  organizationId: null,
  isOwner: false,
  isSuperAdmin: false,
  loading: true,
  reload: async () => {},
});

export function useOrganization() {
  return useContext(OrganizationContext);
}

export { OrganizationContext };

export function useOrganizationLoader(): OrganizationContextValue {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setOrganization(null);
        setProfile(null);
        setIsOwner(false);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      // Check super_admin
      const { data: superCheck } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      setIsSuperAdmin(!!superCheck);

      // Get profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData as UserProfile);

        // Get organization
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profileData.organization_id)
          .maybeSingle();

        if (orgData) {
          setOrganization(orgData as Organization);
          setIsOwner(orgData.owner_id === user.id);
        }
      }
    } catch (err) {
      console.error('Error loading organization:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return {
    organization,
    profile,
    organizationId: profile?.organization_id ?? null,
    isOwner,
    isSuperAdmin,
    loading,
    reload: load,
  };
}
