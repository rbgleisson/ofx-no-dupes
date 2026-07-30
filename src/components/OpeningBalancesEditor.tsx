import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { round2 } from '@/lib/accountBalances';
import type { Account } from './AccountsManager';

interface Props {
  accounts: Account[];
  onSaved?: () => void;
}

const parseAmount = (v: string) => {
  const cleaned = (v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

export default function OpeningBalancesEditor({ accounts, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, { amount: string; date: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, { amount: string; date: string }> = {};
    for (const a of accounts) {
      next[a.id] = {
        amount: String(a.opening_balance ?? 0).replace('.', ','),
        date: a.opening_balance_date ? String(a.opening_balance_date).slice(0, 10) : '',
      };
    }
    setValues(next);
  }, [accounts]);

  const save = async (acc: Account) => {
    const v = values[acc.id];
    if (!v) return;
    setSavingId(acc.id);
    const { error } = await supabase
      .from('accounts')
      .update({
        opening_balance: round2(parseAmount(v.amount)),
        opening_balance_date: v.date || null,
      } as any)
      .eq('id', acc.id);
    setSavingId(null);
    if (error) {
      toast.error('Erro ao salvar saldo inicial: ' + error.message);
      return;
    }
    toast.success(`Saldo inicial de ${acc.name} atualizado.`);
    onSaved?.();
  };

  if (!accounts.length) return null;

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Saldo inicial por conta
      </p>
      <div className="space-y-2">
        {accounts.map(acc => {
          const v = values[acc.id] ?? { amount: '0', date: '' };
          return (
            <div key={acc.id} className="rounded-lg border p-3 flex flex-wrap items-end gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: acc.color }} />
                <span className="text-sm font-medium truncate" title={acc.name}>{acc.name}</span>
              </div>
              <div>
                <Label className="text-[10px]">Saldo inicial</Label>
                <Input
                  className="h-8 w-32 text-sm"
                  placeholder="0,00"
                  value={v.amount}
                  onChange={e => setValues(s => ({ ...s, [acc.id]: { ...v, amount: e.target.value } }))}
                />
              </div>
              <div>
                <Label className="text-[10px]">A partir de</Label>
                <Input
                  type="date"
                  className="h-8 w-40 text-sm"
                  value={v.date}
                  onChange={e => setValues(s => ({ ...s, [acc.id]: { ...v, date: e.target.value } }))}
                />
              </div>
              <Button size="sm" className="h-8" onClick={() => save(acc)} disabled={savingId === acc.id}>
                <Save className="w-3.5 h-3.5 mr-1" /> Salvar
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
