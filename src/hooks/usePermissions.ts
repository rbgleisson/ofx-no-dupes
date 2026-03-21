import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserPermissions {
  is_active: boolean;
  can_import: boolean;
  can_export: boolean;
  can_backup: boolean;
  can_manage_categories: boolean;
  can_manage_accounts: boolean;
  can_manage_chart_accounts: boolean;
  can_create_transactions: boolean;
  can_edit_transactions: boolean;
  can_delete_transactions: boolean;
  can_view_totals: boolean;
  can_clear_all: boolean;
}

const ALL_PERMISSIONS: UserPermissions = {
  is_active: true,
  can_import: true,
  can_export: true,
  can_backup: true,
  can_manage_categories: true,
  can_manage_accounts: true,
  can_manage_chart_accounts: true,
  can_create_transactions: true,
  can_edit_transactions: true,
  can_delete_transactions: true,
  can_view_totals: true,
  can_clear_all: true,
};

export function usePermissions() {
  const [permissions, setPermissions] = useState<UserPermissions>(ALL_PERMISSIONS);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // Check super_admin
        const { data: superCheck } = await supabase.rpc('is_super_admin', { _user_id: user.id });
        if (cancelled) return;

        if (superCheck) {
          setIsSuperAdmin(true);
          setIsAdmin(true);
          setPermissions(ALL_PERMISSIONS);
          setLoading(false);
          return;
        }

        // Check owner
        const { data: ownerCheck } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'owner',
        });
        if (cancelled) return;

        if (ownerCheck) {
          setIsOwner(true);
          setIsAdmin(true);
          setPermissions(ALL_PERMISSIONS);
          setLoading(false);
          return;
        }

        // Check admin (legacy)
        const { data: adminCheck } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin',
        });
        if (cancelled) return;

        if (adminCheck) {
          setIsAdmin(true);
          setPermissions(ALL_PERMISSIONS);
          setLoading(false);
          return;
        }

        // Fetch permissions
        const { data: permsData } = await supabase.rpc('get_user_permissions', {
          _user_id: user.id,
        });

        if (cancelled) return;

        if (permsData) {
          const p = permsData as any;
          setPermissions({
            is_active: p.is_active ?? true,
            can_import: p.can_import ?? true,
            can_export: p.can_export ?? true,
            can_backup: p.can_backup ?? true,
            can_manage_categories: p.can_manage_categories ?? true,
            can_manage_accounts: p.can_manage_accounts ?? true,
            can_manage_chart_accounts: p.can_manage_chart_accounts ?? true,
            can_create_transactions: p.can_create_transactions ?? true,
            can_edit_transactions: p.can_edit_transactions ?? true,
            can_delete_transactions: p.can_delete_transactions ?? true,
            can_view_totals: p.can_view_totals ?? true,
            can_clear_all: p.can_clear_all ?? true,
          });
        }
      } catch (err) {
        console.error('Error loading permissions:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { permissions, isAdmin, isSuperAdmin, isOwner, loading };
}
