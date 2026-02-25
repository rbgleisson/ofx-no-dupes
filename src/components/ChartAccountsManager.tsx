import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Check, X, BookOpen } from 'lucide-react';
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

  const handleAdd = async () => {
    if (!code.trim() || !name.trim()) return;
    await supabase.from('chart_accounts').insert({ code: code.trim(), name: name.trim() });
    setCode('');
    setName('');
    onChartAccountsChange();
  };

  const handleUpdate = async (id: string) => {
    if (!editCode.trim() || !editName.trim()) return;
    await supabase.from('chart_accounts').update({ code: editCode.trim(), name: editName.trim() }).eq('id', id);
    setEditingId(null);
    onChartAccountsChange();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('chart_accounts').delete().eq('id', id);
    onChartAccountsChange();
  };

  const startEdit = (ca: ChartAccount) => {
    setEditingId(ca.id);
    setEditCode(ca.code);
    setEditName(ca.name);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
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

          {/* List */}
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {chartAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conta contábil cadastrada.</p>
            )}
            {chartAccounts.map(ca => (
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
