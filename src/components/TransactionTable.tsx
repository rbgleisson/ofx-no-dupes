import { useState, useRef } from 'react';
import { Transaction, updateTransaction, deleteTransaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { ArrowDownLeft, ArrowUpRight, Paperclip, X, FileText, Loader2, Pencil, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
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
import { cn } from '@/lib/utils';

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
  onTransactionsChange: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

const TransactionTable = ({ transactions, categories, accounts, chartAccounts, onTransactionsChange, onEditTransaction }: TransactionTableProps) => {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const [openCategoryPopover, setOpenCategoryPopover] = useState<string | null>(null);
  const [openChartAccountPopover, setOpenChartAccountPopover] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} lançamento(s)?`)) return;
    for (const id of selectedIds) {
      await deleteTransaction(id);
    }
    setSelectedIds(new Set());
    onTransactionsChange();
  };

  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  const credits = transactions.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const debits = transactions.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string) => {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  };

  const handleAttachClick = (txId: string) => {
    setActiveTransactionId(txId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTransactionId) return;

    setUploading(activeTransactionId);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${activeTransactionId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('transaction-docs').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('transaction-docs').getPublicUrl(path);
      await updateTransaction(activeTransactionId, { attachment_url: data.publicUrl });
      onTransactionsChange();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(null);
      setActiveTransactionId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (txId: string) => {
    setUploading(txId);
    try {
      await updateTransaction(txId, { attachment_url: null });
      onTransactionsChange();
    } finally {
      setUploading(null);
    }
  };

  const handleFieldChange = async (txId: string, field: string, value: string | null) => {
    await updateTransaction(txId, { [field]: value === '__none__' ? null : value });
    onTransactionsChange();
  };

  const handleDelete = async (txId: string) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    await deleteTransaction(txId);
    onTransactionsChange();
  };

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" capture="environment" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border p-4">
          <p className="text-sm text-muted-foreground font-medium">Entradas</p>
          <p className="text-xl font-bold text-[hsl(var(--success))] mt-1 font-mono">{formatCurrency(credits)}</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <p className="text-sm text-muted-foreground font-medium">Saídas</p>
          <p className="text-xl font-bold text-destructive mt-1 font-mono">{formatCurrency(debits)}</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <p className="text-sm text-muted-foreground font-medium">Saldo</p>
          <p className={`text-xl font-bold mt-1 font-mono ${total >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 border px-4 py-2">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selecionado(s)</span>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-1.5" />
            Excluir selecionados
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Cancelar</Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={selectedIds.size === transactions.length && transactions.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Data</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Descrição</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Categoria</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Conta</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Conta Contábil</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Valor</th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Anexo</th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const cat = categories.find(c => c.id === tx.category_id);
                const acc = accounts.find(a => a.id === tx.account_id);
                const ca = chartAccounts.find(c => c.id === (tx as any).chart_account_id);
                const amt = Number(tx.amount);
                return (
                  <tr key={tx.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${selectedIds.has(tx.id) ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(tx.id)}
                        onCheckedChange={() => toggleSelect(tx.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-1.5 flex-shrink-0 ${amt >= 0 ? 'bg-[hsl(var(--success))]/10' : 'bg-destructive/10'}`}>
                          {amt >= 0 ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                          {tx.memo && <p className="text-xs text-muted-foreground mt-0.5 truncate">{tx.memo}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Popover open={openCategoryPopover === tx.id} onOpenChange={(open) => setOpenCategoryPopover(open ? tx.id : null)}>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1.5 h-8 w-36 px-2 text-xs border rounded-md bg-background hover:bg-muted/50 transition-colors text-left">
                            {cat ? (
                              <>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                                <span className="truncate">{cat.name}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar categoria..." className="h-8 text-xs" />
                            <CommandList>
                              <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Nenhuma encontrada.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="__none__"
                                  onSelect={() => { handleFieldChange(tx.id, 'category_id', null); setOpenCategoryPopover(null); }}
                                  className="text-xs"
                                >
                                  <span className="text-muted-foreground">Sem categoria</span>
                                  {!tx.category_id && <Check className="ml-auto h-3 w-3" />}
                                </CommandItem>
                                {categories.map(c => (
                                  <CommandItem
                                    key={c.id}
                                    value={c.name}
                                    onSelect={() => { handleFieldChange(tx.id, 'category_id', c.id); setOpenCategoryPopover(null); }}
                                    className="text-xs"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                                      {c.name}
                                    </span>
                                    {tx.category_id === c.id && <Check className="ml-auto h-3 w-3" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={tx.account_id || '__none__'}
                        onValueChange={val => handleFieldChange(tx.id, 'account_id', val)}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue>
                            {acc ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: acc.color }} />
                                {acc.name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__"><span className="text-muted-foreground">Sem conta</span></SelectItem>
                          {accounts.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                                {a.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Popover open={openChartAccountPopover === tx.id} onOpenChange={(open) => setOpenChartAccountPopover(open ? tx.id : null)}>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1.5 h-8 w-44 px-2 text-xs border rounded-md bg-background hover:bg-muted/50 transition-colors text-left">
                            {ca ? (
                              <span className="truncate"><span className="font-mono text-muted-foreground">{ca.code}</span> {ca.name}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar conta contábil..." className="h-8 text-xs" />
                            <CommandList>
                              <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Nenhuma encontrada.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="__none__"
                                  onSelect={() => { handleFieldChange(tx.id, 'chart_account_id', null); setOpenChartAccountPopover(null); }}
                                  className="text-xs"
                                >
                                  <span className="text-muted-foreground">Sem conta contábil</span>
                                  {!(tx as any).chart_account_id && <Check className="ml-auto h-3 w-3" />}
                                </CommandItem>
                                {chartAccounts.map(c => (
                                  <CommandItem
                                    key={c.id}
                                    value={`${c.code} ${c.name}`}
                                    onSelect={() => { handleFieldChange(tx.id, 'chart_account_id', c.id); setOpenChartAccountPopover(null); }}
                                    className="text-xs"
                                  >
                                    <span className="font-mono text-muted-foreground mr-1">{c.code}</span> {c.name}
                                    {(tx as any).chart_account_id === c.id && <Check className="ml-auto h-3 w-3" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </td>
                    <td className={`px-4 py-3 text-sm font-mono font-semibold text-right whitespace-nowrap ${
                      amt >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'
                    }`}>
                      {formatCurrency(amt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {uploading === tx.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                      ) : tx.attachment_url ? (
                        <div className="flex items-center justify-center gap-1">
                          <a href={tx.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors" title="Ver documento">
                            <FileText className="w-4 h-4" />
                          </a>
                          <button onClick={() => handleRemoveAttachment(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover anexo">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleAttachClick(tx.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Anexar documento">
                          <Paperclip className="w-4 h-4 mx-auto" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => onEditTransaction(tx)} className="text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TransactionTable;
