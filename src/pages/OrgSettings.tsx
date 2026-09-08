import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Building, Users, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AuthorizedEmailsManager from '@/components/AuthorizedEmailsManager';
import AccountantSettings from '@/components/AccountantSettings';

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

interface OrgSettingsProps {
  onBack: () => void;
}

interface OrgUser {
  id: string;
  email: string;
  created_at: string;
}

const OrgSettings = ({ onBack }: OrgSettingsProps) => {
  const { organization, organizationId, isOwner, reload } = useOrganization();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const { toast } = useToast();

  // Create user dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete user
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_org_users', { _org_id: organizationId });
      if (error) throw error;
      setUsers((data || []) as OrgUser[]);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => {
    if (organization) setOrgName(organization.name);
    loadUsers();
  }, [organization, loadUsers]);

  const handleSaveName = async () => {
    if (!orgName.trim() || !organizationId) return;
    setSavingName(true);
    try {
      const { error } = await supabase.from('organizations').update({ name: orgName.trim() }).eq('id', organizationId);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Nome da empresa atualizado.' });
      await reload();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    if (newPassword.length < 6) {
      toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await supabase.functions.invoke('manage-users', {
        body: { action: 'create', email: newEmail, password: newPassword, organizationId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'Sucesso', description: `Usuário ${newEmail} criado e vinculado à empresa!` });
      setNewEmail('');
      setNewPassword('');
      setShowCreateDialog(false);
      await loadUsers();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
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
      toast({ title: 'Sucesso', description: 'Usuário removido.' });
      setDeleteUserId(null);
      await loadUsers();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const deleteUser = users.find(u => u.id === deleteUserId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Building className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Configurações da Empresa</h1>
              <p className="text-sm text-muted-foreground">{organization?.name}</p>
            </div>
          </div>
          {isOwner && (
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <UserPlus className="w-4 h-4 mr-1.5" />
              Novo Funcionário
            </Button>
          )}
        </div>

        {/* Organization Info */}
        <div className="rounded-xl border bg-card p-6 mb-6">
          <h2 className="font-semibold text-foreground mb-4">Dados da Empresa</h2>
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="org-name">Nome</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={!isOwner}
              />
            </div>
            {isOwner && (
              <Button onClick={handleSaveName} disabled={savingName} className="mt-7">
                {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
              </Button>
            )}
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Status: <span className="font-medium text-foreground">{organization?.plan_status === 'active' ? 'Ativo' : organization?.plan_status}</span>
          </div>
        </div>

        {/* Authorized Emails - only for owners */}
        {isOwner && (
          <div className="rounded-xl border bg-card p-4 mb-6">
            <AuthorizedEmailsManager />
          </div>
        )}

        {/* Accountant export settings - only for owners */}
        {isOwner && (
          <div className="rounded-xl border bg-card p-4 mb-6">
            <AccountantSettings />
          </div>
        )}


        {/* Users */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Membros da Empresa ({users.length})</h2>
          </div>
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {isOwner && u.id !== organization?.owner_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteUserId(u.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Funcionário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">E-mail</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="funcionario@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Senha inicial</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Funcionário
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Funcionário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteUser?.email}</strong> da empresa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrgSettings;
