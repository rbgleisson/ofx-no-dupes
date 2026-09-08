import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Account } from '@/components/AccountsManager';
import { Category } from '@/components/CategoriesManager';
import {
  createInvestmentYield,
  createTransfer,
  ensureInvestmentAccount,
} from '@/lib/transfers';
import { isInvestmentAccount } from '@/lib/investmentPositions';

type Mode = 'aplicacao' | 'resgate' | 'rendimento' | 'livre';

interface Props {
  accounts: Account[];
  categories: Category[];
  onDone: () => void;
}

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'aplicacao', label: 'Aplicação', hint: 'Saída do banco → entrada na conta de aplicação' },
  { key: 'resgate', label: 'Resgate', hint: 'Saída da aplicação → entrada no banco' },
  { key: 'rendimento', label: 'Rendimento', hint: 'Crédito direto na conta de aplicação' },
  { key: 'livre', label: 'Entre contas', hint: 'Transferência livre entre duas contas' },
];

export default function TransferDialog({ accounts, categories, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('aplicacao');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [memo, setMemo] = useState('');
  const [bankId, setBankId] = useState('');
  const [toId, setToId] = useState('');
  const [investmentId, setInvestmentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const investmentAccounts = useMemo(() => accounts.filter(isInvestmentAccount), [accounts]);
  const otherAccounts = useMemo(
    () => accounts.filter(a => !isInvestmentAccount(a)),
    [accounts]
  );

  useEffect(() => {
    if (!open) return;
    setInvestmentId(investmentAccounts[0]?.id ?? '');
    setDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setMemo('');
    setBankId(otherAccounts[0]?.id ?? '');
    setToId(otherAccounts[1]?.id ?? '');
  }, [open]);


  useEffect(() => {
    const preset: Record<Mode, string> = {
      aplicacao: 'Aplicação financeira',
      resgate: 'Resgate de aplicação',
      rendimento: 'Rendimento de aplicação',
      livre: 'Transferência entre contas',
    };
    setDescription(preset[mode]);
  }, [mode]);

  const parseAmount = (v: string) => {
    const n = parseFloat((v || '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : Math.abs(n);
  };

  const rendimentoCategory = useMemo(
    () => categories.find(c => /rendiment/i.test(c.name))?.id ?? null,
    [categories]
  );

  const handleSave = async () => {
    const value = parseAmount(amount);
    if (!value) return toast.error('Informe um valor.');
    setSaving(true);
    try {
      if (mode === 'rendimento') {
        const invId = investmentId || (await ensureInvestmentAccount());
        setInvestmentId(invId);
        await createInvestmentYield({ date, amount: value, description, memo, categoryId: rendimentoCategory, accountId: invId });

      } else if (mode === 'livre') {
        await createTransfer({ date, amount: value, fromAccountId: bankId, toAccountId: toId, description, memo });
      } else {
        const invId = investmentId || (await ensureInvestmentAccount());
        setInvestmentId(invId);
        await createTransfer({
          date,
          amount: value,
          fromAccountId: mode === 'aplicacao' ? bankId : invId,
          toAccountId: mode === 'aplicacao' ? invId : bankId,
          description,
          memo,
        });
      }
      toast.success('Lançamento registrado.');
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const AccountSelect = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-2 text-xs"
      >
        <option value="">Selecione...</option>
        {otherAccounts.map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowLeftRight className="w-4 h-4 mr-1.5" />
          Transferência
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transferência entre contas</DialogTitle>
          <DialogDescription>
            Aplicações e resgates não são despesa/receita: o dinheiro apenas muda de conta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {MODES.map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                mode === m.key ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted/50'
              }`}
            >
              {m.label}
              <span className="block text-[10px] text-muted-foreground">{m.hint}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Valor</Label>
              <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {mode === 'livre' ? (
            <div className="grid grid-cols-2 gap-3">
              <AccountSelect value={bankId} onChange={setBankId} label="Conta de origem" />
              <AccountSelect value={toId} onChange={setToId} label="Conta de destino" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {mode !== 'rendimento' && (
                <AccountSelect
                  value={bankId}
                  onChange={setBankId}
                  label={mode === 'aplicacao' ? 'Conta de origem (banco)' : 'Conta de destino (banco)'}
                />
              )}
              <div className={mode === 'rendimento' ? 'col-span-2' : ''}>
                <Label className="text-xs">Conta de aplicação</Label>
                <select
                  value={investmentId}
                  onChange={e => setInvestmentId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                >
                  {investmentAccounts.length === 0 && <option value="">Criar automaticamente</option>}
                  {investmentAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}


          <div>
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Observação (opcional)</Label>
            <Input value={memo} onChange={e => setMemo(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
