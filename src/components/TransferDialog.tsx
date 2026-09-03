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
  INVESTMENT_ACCOUNT_NAME,
} from '@/lib/transfers';

type Mode = 'aplicacao' | 'resgate' | 'rendimento' | 'livre';

interface Props {
  accounts: Account[];
  categories: Category[];
  onDone: () => void;
}

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'aplicacao', label: 'Aplicação', hint: `Saída do banco → entrada em ${INVESTMENT_ACCOUNT_NAME}` },
  { key: 'resgate', label: 'Resgate', hint: `Saída de ${INVESTMENT_ACCOUNT_NAME} → entrada no banco` },
  { key: 'rendimento', label: 'Rendimento', hint: `Crédito direto em ${INVESTMENT_ACCOUNT_NAME}` },
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
  const [investmentId, setInvestmentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const investmentAccount = useMemo(
    () => accounts.find(a => a.name.toLowerCase() === INVESTMENT_ACCOUNT_NAME.toLowerCase()) || null,
    [accounts]
  );
  const otherAccounts = useMemo(
    () => accounts.filter(a => a.id !== investmentAccount?.id),
    [accounts, investmentAccount]
  );

  useEffect(() => {
    if (!open) return;
    setInvestmentId(investmentAccount?.id ?? null);
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
        await createInvestmentYield({ date, amount: value, description, memo, categoryId: rendimentoCategory });
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
          ) : mode === 'rendimento' ? (
            <p className="text-xs text-muted-foreground">
              O valor será creditado diretamente em <strong>{INVESTMENT_ACCOUNT_NAME}</strong>
              {investmentAccount ? '' : ' (a conta será criada automaticamente)'}.
            </p>
          ) : (
            <AccountSelect
              value={bankId}
              onChange={setBankId}
              label={mode === 'aplicacao' ? 'Conta de origem (banco)' : 'Conta de destino (banco)'}
            />
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
