import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Shield, Users, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserEntry {
  id: string;
  email: string;
  created_at: string;
}

interface UserPerms {
  user_id: string;
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

const PERM_LABELS: Record<string, string> = {
  is_active: 'Conta Ativa',
  can_import: 'Importar OFX/Excel',
  can_export: 'Exportar Relatórios',
  can_backup: 'Gerar Backup',
  can_manage_categories: 'Gerenciar Categorias',
  can_manage_accounts: 'Gerenciar Contas',
  can_manage_chart_accounts: 'Gerenciar Plano de Contas',
  can_create_transactions: 'Criar Lançamentos',
  can_edit_transactions: 'Editar Lançamentos',
  can_delete_transactions: 'Excluir Lançamentos',
  can_view_totals: 'Ver Totais/Resumos',
  can_clear_all: 'Limpar Tudo',
};

const PERM_KEYS = Object.keys(PERM_LABELS) as (keyof UserPerms)[];

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel = ({ onBack }: AdminPanelProps) => {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [permissions, setPermissions] = useState<Record<string, UserPerms>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // List all users via RPC
      const { data: usersData, error: usersErr } = await supabase.rpc('list_all_users');
      if (usersErr) throw usersErr;

      const usersList = (usersData || []) as UserEntry[];
      setUsers(usersList);

      // Get all permissions
      const { data: permsData } = await supabase
        .from('user_permissions')
        .select('*');

      const permsMap: Record<string, UserPerms> = {};
      for (const p of (permsData || []) as any[]) {
        permsMap[p.user_id] = p;
      }

      // Ensure permissions exist for all users
      for (const u of usersList) {
        if (!permsMap[u.id]) {
          const { data: newPerm } = await supabase
            .from('user_permissions')
            .insert({ user_id: u.id })
            .select()
            .single();
          if (newPerm) permsMap[u.id] = newPerm as any;
        }
      }

      setPermissions(permsMap);
      if (usersList.length > 0 && !selectedUserId) {
        setSelectedUserId(usersList[0].id);
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao carregar dados.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedUserId]);

  useEffect(() => {
    loadData();
  }, []);

  const togglePermission = async (userId: string, key: keyof UserPerms) => {
    const current = permissions[userId];
    if (!current) return;

    const newVal = !current[key];
    setSaving(userId + key);

    try {
      const { error } = await supabase
        .from('user_permissions')
        .update({ [key]: newVal } as any)
        .eq('user_id', userId);

      if (error) throw error;

      setPermissions(prev => ({
        ...prev,
        [userId]: { ...prev[userId], [key]: newVal },
      }));

      toast({
        title: 'Permissão atualizada',
        description: `${PERM_LABELS[key]}: ${newVal ? 'Ativado' : 'Desativado'}`,
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const selectedPerms = selectedUserId ? permissions[selectedUserId] : null;

  // Check if selected user is admin
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const checkAdmins = async () => {
      const { data } = await supabase.from('user_roles').select('user_id, role');
      const admins = new Set((data || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
      setAdminUserIds(admins);
    };
    checkAdmins();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Painel Administrativo</h1>
            <p className="text-sm text-muted-foreground">Gerencie usuários e permissões</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* User list */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Usuários ({users.length})</h2>
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {users.map(u => {
                const perms = permissions[u.id];
                const isAdmin = adminUserIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      selectedUserId === u.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${perms?.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                      <span className="truncate">{u.email}</span>
                    </div>
                    {isAdmin && (
                      <span className="text-[10px] font-medium text-primary ml-4">ADMIN</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permissions panel */}
          <div className="md:col-span-2 rounded-xl border bg-card p-6">
            {selectedUser && selectedPerms ? (
              <>
                <div className="mb-6">
                  <h2 className="font-semibold text-foreground">{selectedUser.email}</h2>
                  <p className="text-xs text-muted-foreground">
                    Cadastrado em {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}
                    {adminUserIds.has(selectedUser.id) && ' • Administrador'}
                  </p>
                </div>

                {adminUserIds.has(selectedUser.id) ? (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                    <Shield className="w-4 h-4 inline mr-2" />
                    Administradores possuem acesso completo e não podem ter permissões restritas.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {PERM_KEYS.map(key => (
                      <div
                        key={key}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                          key === 'is_active' ? 'border-primary/30 bg-primary/5' : ''
                        }`}
                      >
                        <Label htmlFor={`${selectedUser.id}-${key}`} className="text-sm cursor-pointer">
                          {PERM_LABELS[key]}
                        </Label>
                        <Switch
                          id={`${selectedUser.id}-${key}`}
                          checked={!!selectedPerms[key]}
                          onCheckedChange={() => togglePermission(selectedUser.id, key)}
                          disabled={saving === selectedUser.id + key}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Selecione um usuário para gerenciar suas permissões.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
