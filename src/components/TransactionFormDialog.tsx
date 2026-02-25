import { useState, useEffect } from 'react';
import { Transaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

interface TransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
  onSave: (data: {
    date: string;
    amount: number;
    description: string;
    memo?: string;
    category_id?: string | null;
    account_id?: string | null;
    chart_account_id?: string | null;
  }) => void;
}

const TransactionFormDialog = ({
  open,
  onOpenChange,
  transaction,
  categories,
  accounts,
  chartAccounts,
  onSave,
}: TransactionFormDialogProps) => {
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [memo, setMemo] = useState('');
  const [categoryId, setCategoryId] = useState('__none__');
  const [accountId, setAccountId] = useState('__none__');
  const [chartAccountId, setChartAccountId] = useState('__none__');
  const [chartAccountOpen, setChartAccountOpen] = useState(false);

  useEffect(() => {
    if (transaction) {
      setDate(transaction.date);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setMemo(transaction.memo || '');
      setCategoryId(transaction.category_id || '__none__');
      setAccountId(transaction.account_id || '__none__');
      setChartAccountId((transaction as any).chart_account_id || '__none__');
    } else {
      setDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setDescription('');
      setMemo('');
      setCategoryId('__none__');
      setAccountId('__none__');
      setChartAccountId('__none__');
    }
  }, [transaction, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description.trim()) return;
    onSave({
      date,
      amount: parseFloat(amount),
      description: description.trim(),
      memo: memo.trim() || undefined,
      category_id: categoryId === '__none__' ? null : categoryId,
      account_id: accountId === '__none__' ? null : accountId,
      chart_account_id: chartAccountId === '__none__' ? null : chartAccountId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{transaction ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor</label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="-100.00"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do lançamento" required />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Memo</label>
            <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="Observação (opcional)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Conta</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem conta</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                        {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Conta Contábil</label>
            <Popover open={chartAccountOpen} onOpenChange={setChartAccountOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="flex items-center gap-1.5 h-9 w-full px-3 text-xs border rounded-md bg-background hover:bg-muted/50 transition-colors text-left">
                  {chartAccountId !== '__none__' ? (
                    (() => { const ca = chartAccounts.find(c => c.id === chartAccountId); return ca ? <span className="truncate"><span className="font-mono text-muted-foreground">{ca.code}</span> {ca.name}</span> : <span className="text-muted-foreground">Sem conta contábil</span>; })()
                  ) : (
                    <span className="text-muted-foreground">Sem conta contábil</span>
                  )}
                  <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar conta contábil..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Nenhuma encontrada.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__none__" onSelect={() => { setChartAccountId('__none__'); setChartAccountOpen(false); }} className="text-xs">
                        <span className="text-muted-foreground">Sem conta contábil</span>
                        {chartAccountId === '__none__' && <Check className="ml-auto h-3 w-3" />}
                      </CommandItem>
                      {chartAccounts.map(c => (
                        <CommandItem key={c.id} value={`${c.code} ${c.name}`} onSelect={() => { setChartAccountId(c.id); setChartAccountOpen(false); }} className="text-xs">
                          <span className="font-mono text-muted-foreground mr-1">{c.code}</span> {c.name}
                          {chartAccountId === c.id && <Check className="ml-auto h-3 w-3" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" size="sm">{transaction ? 'Salvar' : 'Adicionar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionFormDialog;
