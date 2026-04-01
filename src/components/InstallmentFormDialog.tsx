import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { createInstallments } from '@/lib/installmentStore';
import { Trash2, Plus } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  accounts: Account[];
  onSaved: () => void;
}

export default function InstallmentFormDialog({ open, onOpenChange, categories, accounts, onSaved }: Props) {
  const [description, setDescription] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [type, setType] = useState<'payable' | 'receivable'>('payable');
  const [totalAmount, setTotalAmount] = useState('');
  const [numInstallments, setNumInstallments] = useState('1');
  const [firstDueDate, setFirstDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [customAmounts, setCustomAmounts] = useState<{ amount: string; due_date: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setDescription(''); setInvoiceNumber(''); setType('payable');
    setTotalAmount(''); setNumInstallments('1');
    setFirstDueDate(new Date().toISOString().split('T')[0]);
    setCategoryId(''); setAccountId(''); setNotes('');
    setUseCustom(false); setCustomAmounts([]);
  };

  const generateCustomRows = () => {
    const n = parseInt(numInstallments) || 1;
    const total = parseFloat(totalAmount.replace(',', '.')) || 0;
    const per = Math.round((total / n) * 100) / 100;
    const remainder = Math.round((total - per * n) * 100) / 100;
    const rows = Array.from({ length: n }, (_, i) => {
      const d = new Date(firstDueDate + 'T12:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + i);
      return {
        amount: String(i === 0 ? per + remainder : per),
        due_date: d.toISOString().split('T')[0],
      };
    });
    setCustomAmounts(rows);
    setUseCustom(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const total = parseFloat(totalAmount.replace(',', '.'));
      if (!total || !description) return;

      await createInstallments({
        description,
        invoice_number: invoiceNumber || undefined,
        type,
        total_amount: total,
        num_installments: parseInt(numInstallments) || 1,
        first_due_date: firstDueDate,
        category_id: categoryId || null,
        account_id: accountId || null,
        notes: notes || undefined,
        custom_amounts: useCustom
          ? customAmounts.map(c => ({ amount: parseFloat(c.amount.replace(',', '.')) || 0, due_date: c.due_date }))
          : undefined,
      });

      resetForm();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('Error creating installments:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Conta Parcelada</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Descrição *</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} required placeholder="Ex: Compra de equipamento" />
            </div>
            <div>
              <Label>Nº Nota Fiscal</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Ex: 12345" />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={type} onValueChange={v => setType(v as 'payable' | 'receivable')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payable">A Pagar</SelectItem>
                  <SelectItem value="receivable">A Receber</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor Total *</Label>
              <Input value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="0,00" required />
            </div>
            <div>
              <Label>Nº de Parcelas</Label>
              <Input type="number" min={1} max={120} value={numInstallments} onChange={e => setNumInstallments(e.target.value)} />
            </div>
            <div>
              <Label>1º Vencimento</Label>
              <Input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Conta Bancária</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionais..." />
            </div>
          </div>

          {/* Custom amounts toggle */}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={generateCustomRows}>
              Editar parcelas individualmente
            </Button>
          </div>

          {useCustom && (
            <div className="space-y-2 border rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground">Parcelas individuais:</p>
              {customAmounts.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                  <Input
                    className="flex-1"
                    value={item.amount}
                    onChange={e => {
                      const copy = [...customAmounts];
                      copy[i] = { ...copy[i], amount: e.target.value };
                      setCustomAmounts(copy);
                    }}
                    placeholder="Valor"
                  />
                  <Input
                    type="date"
                    className="flex-1"
                    value={item.due_date}
                    onChange={e => {
                      const copy = [...customAmounts];
                      copy[i] = { ...copy[i], due_date: e.target.value };
                      setCustomAmounts(copy);
                    }}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setCustomAmounts(customAmounts.filter((_, j) => j !== i))}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setCustomAmounts([...customAmounts, { amount: '', due_date: firstDueDate }])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar parcela
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-primary">
              {loading ? 'Salvando...' : 'Criar Parcelas'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
