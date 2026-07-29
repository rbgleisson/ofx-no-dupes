import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, Check, X, Building2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { round2, applyManualAdjustment, fetchAdjustments, AccountAdjustment, computeAccountBalances } from '@/lib/accountBalances';
import type { Transaction } from '@/lib/transactionStore';
import type { Installment } from '@/lib/installmentStore';

export interface Account {
  id: string;
  name: string;
  color: string;
  created_at: string;
  opening_balance?: number;
  opening_balance_date?: string | null;
}


const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

interface AccountsManagerProps {
  accounts: Account[];
  onAccountsChange: () => void;
  transactions?: Transaction[];
  installments?: Installment[];
}

const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const AccountsManager = ({ accounts, onAccountsChange, transactions = [], installments = [] }: AccountsManagerProps) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newOpening, setNewOpening] = useState<string>('0');
  const [newOpeningDate, setNewOpeningDate] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editOpening, setEditOpening] = useState<string>('0');
  const [editOpeningDate, setEditOpeningDate] = useState<string>('');


  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
  const [adjustValue, setAdjustValue] = useState<string>('');
  const [adjustNote, setAdjustNote] = useState<string>('');
  const [adjustHistory, setAdjustHistory] = useState<AccountAdjustment[]>([]);
  const [adjustSaving, setAdjustSaving] = useState(false);

  const balances = computeAccountBalances(accounts, transactions, installments);
  const balanceFor = (id: string) => balances.find(b => b.account.id === id)?.realized ?? 0;

  const parseAmount = (v: string) => {
    const cleaned = (v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
    const { error } = await supabase.from('accounts').insert({
      name: newName.trim(),
      color: newColor,
      opening_balance: round2(parseAmount(newOpening)),
      opening_balance_date: newOpeningDate || null,
      user_id: user.id,
      organization_id: orgId,
    } as any);
    if (!error) {
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setNewOpening('0');
      setNewOpeningDate('');
      onAccountsChange();

    } else {
      toast.error('Erro ao adicionar conta: ' + error.message);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('accounts').update({
      name: editName.trim(),
      color: editColor,
      opening_balance: round2(parseAmount(editOpening)),
    } as any).eq('id', id);
    if (!error) {
      setEditingId(null);
      onAccountsChange();
    } else {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('accounts').delete().eq('id', id);
    if (!error) onAccountsChange();
  };

  const startEdit = (acc: Account) => {
    setEditingId(acc.id);
    setEditName(acc.name);
    setEditColor(acc.color);
    setEditOpening(String(acc.opening_balance ?? 0).replace('.', ','));
  };

  const openAdjust = async (acc: Account) => {
    setAdjustAccount(acc);
    setAdjustValue(String(balanceFor(acc.id).toFixed(2)).replace('.', ','));
    setAdjustNote('');
    try {
      const hist = await fetchAdjustments(acc.id);
      setAdjustHistory(hist);
    } catch {
      setAdjustHistory([]);
    }
  };

  const handleAdjust = async () => {
    if (!adjustAccount) return;
    const newBal = parseAmount(adjustValue);
    setAdjustSaving(true);
    try {
      await applyManualAdjustment({
        accountId: adjustAccount.id,
        currentRealized: balanceFor(adjustAccount.id),
        newBalance: newBal,
        note: adjustNote,
      });
      toast.success('Saldo ajustado.');
      setAdjustAccount(null);
      onAccountsChange();
    } catch (e: any) {
      toast.error('Erro ao ajustar: ' + (e?.message || e));
    } finally {
      setAdjustSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white border-0">
          <Building2 className="w-4 h-4 mr-1.5" />
          Contas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Contas</DialogTitle>
          <DialogDescription>Cadastre contas, defina o saldo inicial e ajuste manualmente o saldo atual quando necessário.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input placeholder="Nova conta..." value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Saldo inicial</Label>
            <Input value={newOpening} onChange={e => setNewOpening(e.target.value)} className="w-32" placeholder="0,00" />
          </div>
          <div>
            <Label className="text-xs block mb-1">Cor</Label>
            <div className="flex gap-1">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto mt-4">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conta cadastrada.</p>
          )}
          {accounts.map(acc => {
            const realized = balanceFor(acc.id);
            const isEditing = editingId === acc.id;
            return (
              <div key={acc.id} className="rounded-lg border px-3 py-2">
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 min-w-[140px] h-8 text-sm" />
                    <Input value={editOpening} onChange={e => setEditOpening(e.target.value)} className="w-28 h-8 text-sm" placeholder="Saldo inicial" />
                    <div className="flex gap-1">
                      {PRESET_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setEditColor(c)}
                          className={`w-4 h-4 rounded-full border-2 transition-all ${editColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <button onClick={() => handleUpdate(acc.id)} className="text-[hsl(var(--success))]"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: acc.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{acc.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Inicial: {fmt(Number(acc.opening_balance ?? 0))} · Saldo atual: <span className={realized < 0 ? 'text-red-500' : 'text-emerald-600'}>{fmt(realized)}</span>
                      </div>
                    </div>
                    <button onClick={() => openAdjust(acc)} title="Ajuste manual de saldo" className="text-muted-foreground hover:text-blue-600 transition-colors">
                      <Wallet className="w-4 h-4" />
                    </button>
                    <button onClick={() => startEdit(acc)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(acc.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!adjustAccount} onOpenChange={(o) => !o && setAdjustAccount(null)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajuste manual de saldo</DialogTitle>
          <DialogDescription>
            {adjustAccount?.name} — saldo atual: <strong>{fmt(balanceFor(adjustAccount?.id || ''))}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Novo saldo</Label>
            <Input value={adjustValue} onChange={e => setAdjustValue(e.target.value)} placeholder="0,00" />
            <p className="text-xs text-muted-foreground mt-1">
              Diferença: <strong>{fmt(round2(parseAmount(adjustValue) - balanceFor(adjustAccount?.id || '')))}</strong>
              {' '}(será lançada como transferência interna para não afetar Entradas/Despesas)
            </p>
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="Ex.: Reavaliação carteira julho" />
          </div>

          {adjustHistory.length > 0 && (
            <div>
              <Label className="text-xs">Histórico de ajustes</Label>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-1 rounded-md border p-2 bg-muted/30">
                {adjustHistory.map(h => (
                  <div key={h.id} className="text-xs flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleDateString('pt-BR')} — {h.note || 'ajuste'}
                    </span>
                    <span className={h.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                      {h.delta >= 0 ? '+' : ''}{fmt(h.delta)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAdjustAccount(null)}>Cancelar</Button>
          <Button onClick={handleAdjust} disabled={adjustSaving}>Salvar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default AccountsManager;
