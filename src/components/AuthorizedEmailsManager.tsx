import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Mail, Plus, Trash2, Loader2 } from 'lucide-react';

interface AuthorizedEmail {
  id: string;
  email: string;
  created_at: string;
}

const AuthorizedEmailsManager = () => {
  const [emails, setEmails] = useState<AuthorizedEmail[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadEmails = async () => {
    const { data, error } = await supabase
      .from('authorized_emails')
      .select('id, email, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      setEmails(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadEmails(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase
        .from('authorized_emails')
        .insert({ email: newEmail.trim().toLowerCase() });
      if (error) throw error;
      toast({ title: 'Sucesso', description: `E-mail ${newEmail} autorizado.` });
      setNewEmail('');
      await loadEmails();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message?.includes('duplicate') ? 'Este e-mail já está autorizado.' : err.message, variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from('authorized_emails').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Removido', description: 'E-mail removido da lista de autorizados.' });
      await loadEmails();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">E-mails Autorizados ({emails.length})</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Apenas e-mails listados abaixo podem criar conta ou acessar o sistema.
      </p>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          type="email"
          placeholder="novo@email.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={adding}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </form>

      <div className="space-y-1 max-h-[40vh] overflow-y-auto">
        {emails.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Nenhum e-mail autorizado. Adicione para permitir cadastros.
          </p>
        )}
        {emails.map(item => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span className="truncate">{item.email}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => handleDelete(item.id)}
              disabled={deletingId === item.id}
            >
              {deletingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AuthorizedEmailsManager;
