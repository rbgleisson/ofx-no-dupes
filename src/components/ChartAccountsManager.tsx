import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Check, X, BookOpen, Search } from 'lucide-react';
import { filterCatalog } from '@/lib/catalogSearch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

interface ChartAccountsManagerProps {
  chartAccounts: ChartAccount[];
  onChartAccountsChange: () => void;
}

const ChartAccountsManager = ({ chartAccounts, onChartAccountsChange }: ChartAccountsManagerProps) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visible = filterCatalog(chartAccounts, query, ca => [ca.name, ca.code]);

  const handleAdd = async () => {
    if (!code.trim() || !name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Usuário não autenticado. Faça login novamente.');
      return;
    }
    const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
    const { error } = await supabase.from('chart_accounts').insert({ code: code.trim(), name: name.trim(), user_id: user.id, organization_id: orgId });
    if (error) {
      toast.error('Erro ao adicionar: ' + error.message);
      return;
    }
    setCode('');
    setName('');
    onChartAccountsChange();
    toast.success('Conta contábil adicionada!');
  };

  const handleUpdate = async (id: string) => {
    if (!editCode.trim() || !editName.trim()) return;
    const { error } = await supabase.from('chart_accounts').update({ code: editCode.trim(), name: editName.trim() }).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar: ' + error.message);
      return;
    }
    setEditingId(null);
    onChartAccountsChange();
    toast.success('Conta atualizada!');
  };

  const handleDelete = async (id: string) => {
    // First, unlink any transactions using this chart account
    await supabase.from('transactions').update({ chart_account_id: null }).eq('chart_account_id', id);
    
    const { error } = await supabase.from('chart_accounts').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir: ' + error.message);
      return;
    }
    onChartAccountsChange();
    toast.success('Conta excluída!');
  };

  const startEdit = (ca: ChartAccount) => {
    setEditingId(ca.id);
    setEditCode(ca.code);
    setEditName(ca.name);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setEditingId(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white border-0">
          <BookOpen className="w-4 h-4 mr-1.5" />
          Plano de Contas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Plano de Contas Contábeis</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add form */}
          <div className="flex gap-2">
            <Input
              placeholder="Código (ex: 1.1.01)"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-32 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <Input
              placeholder="Nome da conta"
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 text-sm"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <Button size="sm" onClick={handleAdd} disabled={!code.trim() || !name.trim()}>Adicionar</Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar conta por nome ou código..."
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setEditingId(null);
              }}
              className="h-8 text-xs pl-7"
            />
          </div>

          {/* List */}
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {chartAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conta contábil cadastrada.</p>
            )}
            {chartAccounts.length > 0 && visible.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma conta encontrada para "{query.trim()}".
              </p>
            )}
            {query.trim() && chartAccounts.length > 0 && (
              <p className="text-xs text-muted-foreground px-2">
                {visible.length} de {chartAccounts.length} conta{chartAccounts.length === 1 ? '' : 's'}
              </p>
            )}
            {visible.map(ca => (
              <div key={ca.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 group">
                {editingId === ca.id ? (
                  <>
                    <Input value={editCode} onChange={e => setEditCode(e.target.value)} className="w-28 h-7 text-xs" />
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 h-7 text-xs" />
                    <button onClick={() => handleUpdate(ca.id)} className="text-[hsl(var(--success))] hover:text-[hsl(var(--success))]/80"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-mono text-muted-foreground w-20">{ca.code}</span>
                    <span className="text-sm flex-1">{ca.name}</span>
                    <button onClick={() => startEdit(ca)} className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(ca.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChartAccountsManager;
