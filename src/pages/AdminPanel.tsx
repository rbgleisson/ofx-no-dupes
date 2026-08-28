import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Shield, Users, Loader2, UserPlus, Trash2, Building, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

interface OrgEntry {
  id: string;
  name: string;
  owner_id: string;
  plan_status: string;
  created_at: string;
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
  const { isSuperAdmin } = useOrganization();
  const [organizations, setOrganizations] = useState<OrgEntry[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [permissions, setPermissions] = useState<Record<string, UserPerms>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Create org dialog
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Delete user
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Delete organization
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const [deleteOrgConfirm, setDeleteOrgConfirm] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);


  const loadOrgs = useCallback(async () => {
    const { data } = await supabase.from('organizations').select('*').order('name');
    if (data) {
      setOrganizations(data as OrgEntry[]);
      if (data.length > 0 && !selectedOrgId) {
        setSelectedOrgId(data[0].id);
      }
    }
  }, [selectedOrgId]);

  const loadOrgUsers = useCallback(async (orgId: string) => {
    setLoading(true);
    try {
      const { data: usersData, error } = await supabase.rpc('list_org_users', { _org_id: orgId });
      if (error) throw error;

      const usersList = (usersData || []) as UserEntry[];
      setUsers(usersList);

      const { data: permsData } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('organization_id', orgId);

      const permsMap: Record<string, UserPerms> = {};
      for (const p of (permsData || []) as any[]) {
        permsMap[p.user_id] = p;
      }

      for (const u of usersList) {
        if (!permsMap[u.id]) {
          const { data: newPerm } = await supabase
            .from('user_permissions')
            .insert({ user_id: u.id, organization_id: orgId })
            .select()
            .single();
          if (newPerm) permsMap[u.id] = newPerm as any;
        }
      }

      setPermissions(permsMap);
      if (usersList.length > 0 && !selectedUserId) {
        setSelectedUserId(usersList[0].id);
      }

      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role');
      const admins = new Set(
        (rolesData || [])
          .filter((r: any) => r.role === 'admin' || r.role === 'owner' || r.role === 'super_admin')
          .map((r: any) => r.user_id)
      );
      setAdminUserIds(admins);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedUserId]);

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      setSelectedUserId(null);
      loadOrgUsers(selectedOrgId);
    }
  }, [selectedOrgId]);

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

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName || !newOwnerEmail || !newOwnerPassword) return;
    setCreatingOrg(true);
    try {
      const res = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'create_organization',
          orgName: newOrgName,
          ownerEmail: newOwnerEmail,
          ownerPassword: newOwnerPassword,
        },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: 'Sucesso', description: `Organização "${newOrgName}" criada!` });
      setNewOrgName('');
      setNewOwnerEmail('');
      setNewOwnerPassword('');
      setShowCreateOrgDialog(false);
      await loadOrgs();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', userId: deleteUserId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'Sucesso', description: 'Usuário excluído.' });
      if (selectedUserId === deleteUserId) setSelectedUserId(null);
      setDeleteUserId(null);
      if (selectedOrgId) await loadOrgUsers(selectedOrgId);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!deleteOrgId || deleteOrgConfirm !== 'APAGAR') return;
    setDeletingOrg(true);
    try {
      const res = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete_organization', organizationId: deleteOrgId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'Organização excluída', description: `${res.data?.deletedUsers ?? 0} usuário(s) removido(s).` });
      setDeleteOrgId(null);
      setDeleteOrgConfirm('');
      setSelectedOrgId(null);
      setUsers([]);
      await loadOrgs();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingOrg(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const selectedPerms = selectedUserId ? permissions[selectedUserId] : null;
  const deleteUser = users.find(u => u.id === deleteUserId);
  const selectedOrg = organizations.find(o => o.id === selectedOrgId);
  const deleteOrg = organizations.find(o => o.id === deleteOrgId);


  if (loading && organizations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Super Admin</h1>
              <p className="text-sm text-muted-foreground">Gestão global de organizações e usuários</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateOrgDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Empresa
          </Button>
        </div>

        {/* Organizations selector */}
        <div className="rounded-xl border bg-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Building className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Organizações ({organizations.length})</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {organizations.map(org => (
              <Button
                key={org.id}
                variant={selectedOrgId === org.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedOrgId(org.id)}
              >
                {org.name}
              </Button>
            ))}
          </div>
          {isSuperAdmin && selectedOrg && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Excluir <strong>{selectedOrg.name}</strong> remove todos os lançamentos, contas, categorias e usuários dela.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0"
                onClick={() => { setDeleteOrgId(selectedOrg.id); setDeleteOrgConfirm(''); }}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Excluir organização
              </Button>
            </div>
          )}
        </div>


        {selectedOrg && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* User list */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold text-sm">Usuários de {selectedOrg.name} ({users.length})</h2>
              </div>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {users.map(u => {
                    const perms = permissions[u.id];
                    const isPrivileged = adminUserIds.has(u.id);
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
                        {isPrivileged && (
                          <span className="text-[10px] font-medium text-primary ml-4">
                            {u.id === selectedOrg.owner_id ? 'DONO' : 'ADMIN'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Permissions panel */}
            <div className="md:col-span-2 rounded-xl border bg-card p-6">
              {selectedUser && selectedPerms ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="font-semibold text-foreground">{selectedUser.email}</h2>
                      <p className="text-xs text-muted-foreground">
                        Cadastrado em {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}
                        {adminUserIds.has(selectedUser.id) && ' • Privilegiado'}
                      </p>
                    </div>
                    {!adminUserIds.has(selectedUser.id) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteUserId(selectedUser.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Excluir
                      </Button>
                    )}
                  </div>

                  {adminUserIds.has(selectedUser.id) ? (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                      <Shield className="w-4 h-4 inline mr-2" />
                      Usuários privilegiados (donos/admins) possuem acesso completo.
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
                  Selecione um usuário para gerenciar permissões.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                placeholder="Ex: Empresa ABC Ltda"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail do Dono</Label>
              <Input
                type="email"
                placeholder="dono@empresa.com"
                value={newOwnerEmail}
                onChange={(e) => setNewOwnerEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Senha inicial do Dono</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={creatingOrg}>
              {creatingOrg && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Empresa
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteUser?.email}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Organization Confirmation */}
      <AlertDialog open={!!deleteOrgId} onOpenChange={(open) => { if (!open) { setDeleteOrgId(null); setDeleteOrgConfirm(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Organização</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga <strong>permanentemente</strong> a organização <strong>{deleteOrg?.name}</strong> e todos os seus dados:
              lançamentos, parcelas, contas, categorias, plano de contas, favorecidos e os usuários vinculados.
              Digite <strong>APAGAR</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteOrgConfirm}
            onChange={(e) => setDeleteOrgConfirm(e.target.value)}
            placeholder="APAGAR"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingOrg}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteOrg(); }}
              disabled={deletingOrg || deleteOrgConfirm !== 'APAGAR'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingOrg && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
};

export default AdminPanel;
