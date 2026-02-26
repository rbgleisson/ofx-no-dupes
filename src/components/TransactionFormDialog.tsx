import { useState, useEffect, useRef } from 'react';
import { Transaction } from '@/lib/transactionStore';
import { uploadAttachment } from '@/lib/attachmentStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Paperclip, X, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
    attachment_url?: string | null;
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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractDataFromFile = async (file: File) => {
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('extract-attachment-data', {
        body: { fileBase64: base64, fileName: file.name, mimeType: file.type },
      });

      if (error) throw error;

      let applied = false;
      if (data?.date && !transaction) {
        setDate(data.date);
        applied = true;
      }
      if (data?.amount != null && !amount) {
        setAmount(data.amount.toString());
        applied = true;
      }

      if (applied) {
        toast.success('Dados extraídos do anexo com sucesso!');
      } else if (!data?.date && !data?.amount) {
        toast.info('Não foi possível extrair dados do anexo.');
      }
    } catch (err) {
      console.error('Extraction error:', err);
      toast.error('Erro ao extrair dados do anexo.');
    } finally {
      setIsExtracting(false);
    }
  };
  useEffect(() => {
    if (transaction) {
      setDate(transaction.date);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setMemo(transaction.memo || '');
      setCategoryId(transaction.category_id || '__none__');
      setAccountId(transaction.account_id || '__none__');
      setChartAccountId((transaction as any).chart_account_id || '__none__');
      setAttachmentFile(null);
    } else {
      setDate(new Date().toISOString().split('T')[0]);
      setAmount('');
      setDescription('');
      setMemo('');
      setCategoryId('__none__');
      setAccountId('__none__');
      setChartAccountId('__none__');
      setAttachmentFile(null);
    }
  }, [transaction, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !amount || !description.trim()) return;

    setIsUploading(true);
    try {
      let attachment_url: string | null = null;
      if (attachmentFile) {
        const tempId = transaction?.id || crypto.randomUUID();
        attachment_url = await uploadAttachment(tempId, attachmentFile);
      }

      onSave({
        date,
        amount: parseFloat(amount),
        description: description.trim(),
        memo: memo.trim() || undefined,
        category_id: categoryId === '__none__' ? null : categoryId,
        account_id: accountId === '__none__' ? null : accountId,
        chart_account_id: chartAccountId === '__none__' ? null : chartAccountId,
        attachment_url,
      });
      onOpenChange(false);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
            <Popover open={chartAccountOpen} onOpenChange={setChartAccountOpen} modal={false}>
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
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Anexo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAttachmentFile(f);
                  extractDataFromFile(f);
                }
                e.target.value = '';
              }}
            />
            {attachmentFile ? (
              <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-xs">
                {isExtracting ? (
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 animate-pulse" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1">
                  {isExtracting ? 'Extraindo dados...' : attachmentFile.name}
                </span>
                <button type="button" onClick={() => setAttachmentFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" />
                Anexar documento
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={isUploading}>
              {isUploading ? 'Enviando...' : transaction ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionFormDialog;
