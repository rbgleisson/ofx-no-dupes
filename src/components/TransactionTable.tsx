import { useState, useRef, useMemo } from 'react';
import { Transaction, updateTransaction, deleteTransaction, countAttachments } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { ArrowDownLeft, ArrowUpRight, Paperclip, X, FileText, Loader2, Pencil, Trash2, Check, ChevronsUpDown, ScanLine, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeftRight, FilterX, FileSpreadsheet } from 'lucide-react';
import { exportExtrato } from '@/lib/extratoExport';

import { Input } from '@/components/ui/input';
import QrScannerDialog from '@/components/QrScannerDialog';
import TransactionDetailSheet from '@/components/TransactionDetailSheet';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  onEditTransaction?: (tx: Transaction) => void;
  canDelete?: boolean;
}

const TransactionTable = ({ transactions, categories, accounts, chartAccounts, onTransactionsChange, onEditTransaction, canDelete = true }: TransactionTableProps) => {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const [openCategoryPopover, setOpenCategoryPopover] = useState<string | null>(null);
  const [openChartAccountPopover, setOpenChartAccountPopover] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTargetTxId, setScanTargetTxId] = useState<string | null>(null);
  const [fetchingDanfe, setFetchingDanfe] = useState<string | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<Transaction | null>(null);
  const [sortField, setSortField] = useState<'date' | 'description' | 'amount' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [exportingExtrato, setExportingExtrato] = useState(false);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState('');

  const saveMemo = async (tx: Transaction) => {
    const value = memoDraft.trim();
    setEditingMemoId(null);
    if (value === (tx.memo || '')) return;
    try {
      await updateTransaction(tx.id, { memo: value || null } as Partial<Transaction>);
      onTransactionsChange();
    } catch (err: any) {
      toast.error('Erro ao salvar memo: ' + (err?.message || ''));
    }
  };



  // Column filters (per-column header filters)
  const [colFilters, setColFilters] = useState<{
    date: string;
    description: string;
    category: string;
    account: string;
    code: string;
    chartAccount: string;
    amount: string;
    attachment: 'all' | 'yes' | 'no';
    verified: 'all' | 'yes' | 'no';
  }>({
    date: '', description: '', category: '', account: '', code: '',
    chartAccount: '', amount: '', attachment: 'all', verified: 'all',
  });

  const hasColFilters = !!(colFilters.date || colFilters.description || colFilters.category || colFilters.account || colFilters.code || colFilters.chartAccount || colFilters.amount || colFilters.attachment !== 'all' || colFilters.verified !== 'all');

  const clearColFilters = () => setColFilters({ date: '', description: '', category: '', account: '', code: '', chartAccount: '', amount: '', attachment: 'all', verified: 'all' });

  const toggleSort = (field: 'date' | 'description' | 'amount') => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const parseAmountFilter = (raw: string): ((n: number) => boolean) | null => {
    const s = raw.trim().replace(',', '.');
    if (!s) return null;
    const m = s.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const op = m[1] || '=';
      const val = parseFloat(m[2]);
      return (n) => {
        const a = Math.abs(n);
        const v = Math.abs(val);
        switch (op) {
          case '>': return a > v;
          case '<': return a < v;
          case '>=': return a >= v;
          case '<=': return a <= v;
          default: return a.toFixed(2) === v.toFixed(2);
        }
      };
    }
    return (n) => Math.abs(n).toFixed(2).includes(s);
  };

  const filteredTransactions = useMemo(() => {
    if (!hasColFilters) return transactions;
    const amountPred = parseAmountFilter(colFilters.amount);
    const dateQ = colFilters.date.trim().toLowerCase();
    const descQ = colFilters.description.trim().toLowerCase();
    const codeQ = colFilters.code.trim().toLowerCase();
    return transactions.filter(tx => {
      if (dateQ) {
        const [y, m, d] = tx.date.split('-');
        const formatted = `${d}/${m}/${y}`;
        if (!formatted.toLowerCase().includes(dateQ) && !tx.date.includes(dateQ)) return false;
      }
      if (descQ) {
        const hay = `${tx.description} ${tx.memo || ''}`.toLowerCase();
        if (!hay.includes(descQ)) return false;
      }
      if (colFilters.category) {
        if (colFilters.category === '__none__') { if (tx.category_id) return false; }
        else if (tx.category_id !== colFilters.category) return false;
      }
      if (colFilters.account) {
        if (colFilters.account === '__none__') { if (tx.account_id) return false; }
        else if (tx.account_id !== colFilters.account) return false;
      }
      const ca = chartAccounts.find(c => c.id === (tx as any).chart_account_id);
      if (codeQ) {
        if (!ca || !ca.code.toLowerCase().includes(codeQ)) return false;
      }
      if (colFilters.chartAccount) {
        if (colFilters.chartAccount === '__none__') { if ((tx as any).chart_account_id) return false; }
        else if ((tx as any).chart_account_id !== colFilters.chartAccount) return false;
      }
      if (amountPred && !amountPred(Number(tx.amount))) return false;
      if (colFilters.attachment === 'yes' && !tx.attachment_url) return false;
      if (colFilters.attachment === 'no' && tx.attachment_url) return false;
      if (colFilters.verified === 'yes' && !(tx as any).is_verified) return false;
      if (colFilters.verified === 'no' && (tx as any).is_verified) return false;
      return true;
    });
  }, [transactions, colFilters, hasColFilters, chartAccounts]);

  const sortedTransactions = useMemo(() => {
    if (!sortField) return filteredTransactions;
    return [...filteredTransactions].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'description') cmp = a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' });
      else if (sortField === 'amount') cmp = Number(a.amount) - Number(b.amount);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredTransactions, sortField, sortDir]);

  const handleExportExtrato = async () => {
    if (sortedTransactions.length === 0) {
      toast.warning('Nenhum lançamento na tela para exportar.');
      return;
    }
    setExportingExtrato(true);
    try {
      const rows = sortField
        ? sortedTransactions
        : [...sortedTransactions].sort((a, b) => a.date.localeCompare(b.date));
      const stamp = new Date().toISOString().slice(0, 10);
      await exportExtrato(rows, categories, accounts, chartAccounts, `extrato_${stamp}.xlsx`);
      toast.success('Extrato exportado!');
    } catch (err: any) {
      console.error('Export extrato error:', err);
      toast.error('Erro ao exportar extrato: ' + (err?.message || ''));
    } finally {
      setExportingExtrato(false);
    }
  };


  const SortIcon = ({ field }: { field: 'date' | 'description' | 'amount' }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const toggleSelect = (id: string, shiftKey = false) => {
    if (shiftKey && lastSelectedId && lastSelectedId !== id) {
      const ids = sortedTransactions.map(t => t.id);
      const a = ids.indexOf(lastSelectedId);
      const b = ids.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [start, end] = a < b ? [a, b] : [b, a];
        const rangeIds = ids.slice(start, end + 1);
        const shouldSelect = !selectedIds.has(id);
        setSelectedIds(prev => {
          const next = new Set(prev);
          rangeIds.forEach(rid => { if (shouldSelect) next.add(rid); else next.delete(rid); });
          return next;
        });
        setLastSelectedId(id);
        return;
      }
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastSelectedId(id);
  };

  const toggleAll = () => {
    const visibleIds = sortedTransactions.map(t => t.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    let withAttachments = 0;
    try { withAttachments = await countAttachments(ids); } catch {}
    if (withAttachments > 0) {
      if (!confirm(`⚠️ ${withAttachments} de ${ids.length} lançamento(s) selecionados possuem ANEXO vinculado.\n\nO anexo fica guardado pelo FITID: ao reimportar o OFX, ele volta automaticamente para o lançamento.\n\nConfirma mesmo assim a exclusão?`)) return;
    }
    if (!confirm(`Tem certeza que deseja excluir ${ids.length} lançamento(s)?`)) return;
    for (const id of selectedIds) {
      await deleteTransaction(id);
    }
    setSelectedIds(new Set());
    onTransactionsChange();
  };

  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkChartOpen, setBulkChartOpen] = useState(false);

  const handleBulkAssignCategory = async (categoryId: string | null) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: categoryId })
        .in('id', ids);
      if (error) throw error;
      toast.success(`Categoria aplicada em ${ids.length} lançamento(s)`);
      setBulkCategoryOpen(false);
      setSelectedIds(new Set());
      onTransactionsChange();
    } catch (err: any) {
      toast.error('Erro ao aplicar categoria: ' + (err?.message || ''));
    }
  };

  const handleBulkAssignChartAccount = async (chartAccountId: string | null) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ chart_account_id: chartAccountId })
        .in('id', ids);
      if (error) throw error;
      toast.success(`Conta contábil aplicada em ${ids.length} lançamento(s)`);
      setBulkChartOpen(false);
      setSelectedIds(new Set());
      onTransactionsChange();
    } catch (err: any) {
      toast.error('Erro ao aplicar conta contábil: ' + (err?.message || ''));
    }
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

  const [removeConfirmTxId, setRemoveConfirmTxId] = useState<string | null>(null);

  const confirmRemoveAttachment = async () => {
    if (!removeConfirmTxId) return;
    setUploading(removeConfirmTxId);
    try {
      await updateTransaction(removeConfirmTxId, { attachment_url: null });
      onTransactionsChange();
    } finally {
      setUploading(null);
      setRemoveConfirmTxId(null);
    }
  };

  const handleFieldChange = async (txId: string, field: string, value: string | null) => {
    let finalValue: any = value === '__none__' ? null : value;
    if (field === 'is_verified') finalValue = value === 'true';
    await updateTransaction(txId, { [field]: finalValue });
    onTransactionsChange();
  };

  const handleDelete = async (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (tx?.attachment_url && !confirm('Este lançamento possui ANEXO vinculado. O anexo fica guardado pelo FITID e volta automaticamente na reimportação do OFX. Deseja excluir?')) return;
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    await deleteTransaction(txId);
    onTransactionsChange();
  };

  const handleScanClick = (txId: string) => {
    setScanTargetTxId(txId);
    setScannerOpen(true);
  };

  const handleAccessKey = async (key: string) => {
    if (!scanTargetTxId) return;
    setFetchingDanfe(scanTargetTxId);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-danfe', {
        body: { access_key: key, transaction_id: scanTargetTxId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success('Chave de acesso NF-e salva com sucesso!');
        onTransactionsChange();
      }
    } catch (err: any) {
      console.error('fetch-danfe error:', err);
      toast.error('Erro ao buscar DANFE: ' + (err.message || 'Tente novamente'));
    } finally {
      setFetchingDanfe(null);
      setScanTargetTxId(null);
    }
  };

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" capture="environment" />
      <QrScannerDialog open={scannerOpen} onClose={() => setScannerOpen(false)} onAccessKey={handleAccessKey} />
      <AlertDialog open={!!removeConfirmTxId} onOpenChange={(open) => { if (!open) setRemoveConfirmTxId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o anexo deste lançamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveAttachment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TransactionDetailSheet
        transaction={detailTransaction}
        open={!!detailTransaction}
        onClose={() => setDetailTransaction(null)}
        categories={categories}
        accounts={accounts}
        chartAccounts={chartAccounts}
        onEdit={onEditTransaction}
      />

      {/* Extrato export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportExtrato} disabled={exportingExtrato || sortedTransactions.length === 0}>
          <FileSpreadsheet className="w-4 h-4 mr-1.5" />
          {exportingExtrato ? 'Exportando...' : `Exportar Extrato (${sortedTransactions.length})`}
        </Button>
      </div>

      {/* Bulk actions */}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 border px-4 py-2">
          <span className="text-sm text-muted-foreground">{selectedIds.size} selecionado(s)</span>

          <Popover open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Aplicar categoria
                <ChevronsUpDown className="ml-1.5 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar categoria..." className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Nenhuma encontrada.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="__none__" onSelect={() => handleBulkAssignCategory(null)} className="text-xs">
                      <span className="text-muted-foreground">Sem categoria</span>
                    </CommandItem>
                    {categories.map(c => (
                      <CommandItem key={c.id} value={c.name} onSelect={() => handleBulkAssignCategory(c.id)} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={bulkChartOpen} onOpenChange={setBulkChartOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Aplicar conta contábil
                <ChevronsUpDown className="ml-1.5 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar conta contábil..." className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">Nenhuma encontrada.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="__none__" onSelect={() => handleBulkAssignChartAccount(null)} className="text-xs">
                      <span className="text-muted-foreground">Sem conta contábil</span>
                    </CommandItem>
                    {chartAccounts.map(c => (
                      <CommandItem key={c.id} value={`${c.code} ${c.name}`} onSelect={() => handleBulkAssignChartAccount(c.id)} className="text-xs">
                        <span className="truncate">{c.code} - {c.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

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
                    checked={sortedTransactions.length > 0 && sortedTransactions.every(t => selectedIds.has(t.id))}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('date')}>
                  Data <SortIcon field="date" />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('description')}>
                  Descrição <SortIcon field="description" />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Categoria</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Conta</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-3">Código</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Conta Contábil</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('amount')}>
                  Valor <SortIcon field="amount" />
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Anexo</th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-3" title="Conferido">✓</th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Ações</th>
              </tr>
              <tr className="border-b bg-background/50">
                <th className="px-2 py-2 text-center">
                  {hasColFilters && (
                    <button onClick={clearColFilters} title="Limpar filtros de coluna" className="text-muted-foreground hover:text-foreground">
                      <FilterX className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  )}
                </th>
                <th className="px-2 py-2">
                  <Input placeholder="Filtrar..." value={colFilters.date} onChange={e => setColFilters(f => ({ ...f, date: e.target.value }))} className="h-7 text-xs" />
                </th>
                <th className="px-2 py-2">
                  <Input placeholder="Filtrar descrição..." value={colFilters.description} onChange={e => setColFilters(f => ({ ...f, description: e.target.value }))} className="h-7 text-xs" />
                </th>
                <th className="px-2 py-2">
                  <Select value={colFilters.category || '__all__'} onValueChange={v => setColFilters(f => ({ ...f, category: v === '__all__' ? '' : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="__none__">Sem categoria</SelectItem>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </th>
                <th className="px-2 py-2">
                  <Select value={colFilters.account || '__all__'} onValueChange={v => setColFilters(f => ({ ...f, account: v === '__all__' ? '' : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="__none__">Sem conta</SelectItem>
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
                </th>
                <th className="px-2 py-2">
                  <Input placeholder="Código..." value={colFilters.code} onChange={e => setColFilters(f => ({ ...f, code: e.target.value }))} className="h-7 text-xs" />
                </th>
                <th className="px-2 py-2">
                  <Select value={colFilters.chartAccount || '__all__'} onValueChange={v => setColFilters(f => ({ ...f, chartAccount: v === '__all__' ? '' : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="__none__">Sem conta contábil</SelectItem>
                      {chartAccounts.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="truncate">{c.code} - {c.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </th>
                <th className="px-2 py-2">
                  <Input placeholder=">100, <50, =42" value={colFilters.amount} onChange={e => setColFilters(f => ({ ...f, amount: e.target.value }))} className="h-7 text-xs text-right" />
                </th>
                <th className="px-2 py-2">
                  <Select value={colFilters.attachment} onValueChange={(v: any) => setColFilters(f => ({ ...f, attachment: v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="yes">Com anexo</SelectItem>
                      <SelectItem value="no">Sem anexo</SelectItem>
                    </SelectContent>
                  </Select>
                </th>
                <th className="px-2 py-2">
                  <Select value={colFilters.verified} onValueChange={(v: any) => setColFilters(f => ({ ...f, verified: v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="yes">Conferidos</SelectItem>
                      <SelectItem value="no">Não conferidos</SelectItem>
                    </SelectContent>
                  </Select>
                </th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((tx) => {
                const cat = categories.find(c => c.id === tx.category_id);
                const acc = accounts.find(a => a.id === tx.account_id);
                const ca = chartAccounts.find(c => c.id === (tx as any).chart_account_id);
                const amt = Number(tx.amount);
                return (
                  <tr key={tx.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${selectedIds.has(tx.id) ? 'bg-primary/5' : ''} ${tx.is_transfer ? 'opacity-60 bg-muted/20' : ''}`} onClick={() => setDetailTransaction(tx)}>
                    <td
                      className="px-4 py-3"
                      onClick={e => {
                        e.stopPropagation();
                        const target = e.target as HTMLElement;
                        // Only intercept when clicking the checkbox area itself
                        if (target.closest('[data-row-checkbox]')) {
                          e.preventDefault();
                          toggleSelect(tx.id, e.shiftKey);
                        }
                      }}
                    >
                      <span data-row-checkbox className="inline-block" style={{ userSelect: 'none' }}>
                        <Checkbox
                          checked={selectedIds.has(tx.id)}
                          onCheckedChange={() => { /* handled by td onClick to capture shiftKey */ }}
                        />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-1.5 flex-shrink-0 ${tx.is_transfer ? 'bg-muted' : amt >= 0 ? 'bg-[hsl(var(--success))]/10' : 'bg-destructive/10'}`}>
                          {tx.is_transfer ? (
                            <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : amt >= 0 ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
                          )}
                        </div>
                        <div className="min-w-0" onClick={e => e.stopPropagation()}>
                          <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                          {tx.is_transfer && <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Mov. Interna</span>}
                          {editingMemoId === tx.id ? (
                            <Input
                              autoFocus
                              value={memoDraft}
                              onChange={e => setMemoDraft(e.target.value)}
                              onBlur={() => saveMemo(tx)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                if (e.key === 'Escape') { setEditingMemoId(null); }
                              }}
                              placeholder="Memo..."
                              className="h-6 mt-0.5 text-xs px-1.5"
                            />
                          ) : (
                            <p
                              title="Clique para editar o memo"
                              onClick={() => { setEditingMemoId(tx.id); setMemoDraft(tx.memo || ''); }}
                              className={cn(
                                'text-xs mt-0.5 truncate cursor-text rounded px-1 -mx-1 hover:bg-muted/60',
                                tx.memo ? 'text-muted-foreground' : 'text-muted-foreground/40 italic',
                              )}
                            >
                              {tx.memo || 'adicionar memo'}
                            </p>
                          )}
                        </div>

                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                    <td className="px-2 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {ca ? ca.code : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {uploading === tx.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                      ) : tx.attachment_url ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { import('@/lib/openAttachment').then(m => m.openAttachment(tx.attachment_url!)); }} className="text-primary hover:text-primary/80 transition-colors" title="Ver documento">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button onClick={() => setRemoveConfirmTxId(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover anexo">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleAttachClick(tx.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Anexar documento">
                          <Paperclip className="w-4 h-4 mx-auto" />
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={!!(tx as any).is_verified}
                        onCheckedChange={async (checked) => {
                          await handleFieldChange(tx.id, 'is_verified', checked ? 'true' : null);
                        }}
                        className="mx-auto"
                        title={`${(tx as any).is_verified ? 'Conferido' : 'Marcar como conferido'}`}
                      />
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleScanClick(tx.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Escanear NF-e" disabled={fetchingDanfe === tx.id}>
                          {fetchingDanfe === tx.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanLine className="w-3.5 h-3.5" />}
                        </button>
                        {onEditTransaction && (
                          <button onClick={() => onEditTransaction(tx)} className="text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
