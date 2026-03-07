import { useState } from 'react';
import { ExcelRow } from '@/lib/excelImport';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { Transaction } from '@/lib/transactionStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ExcelRow[];
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
  existingTransactions: Transaction[];
  onConfirm: (rows: ExcelRow[]) => void;
}

function isDuplicate(row: ExcelRow, existing: Transaction[]): boolean {
  return existing.some(t =>
    t.date === row.date &&
    Math.abs(t.amount - row.amount) < 0.01 &&
    (t.account_id || null) === (row.account_id || null)
  );
}

const ExcelImportReviewDialog = ({ open, onOpenChange, rows: initialRows, categories, accounts, chartAccounts, existingTransactions, onConfirm }: Props) => {
  const [rows, setRows] = useState<ExcelRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openCatPopover, setOpenCatPopover] = useState<number | null>(null);
  const [openChartPopover, setOpenChartPopover] = useState<number | null>(null);

  // Sync when dialog opens with new data
  const [prevRows, setPrevRows] = useState(initialRows);
  if (initialRows !== prevRows) {
    setRows(initialRows);
    setPrevRows(initialRows);
    // Pre-select all non-duplicate rows, deselect duplicates
    const sel = new Set<number>();
    initialRows.forEach((r, i) => {
      if (!isDuplicate(r, existingTransactions)) {
        sel.add(i);
      }
    });
    setSelected(sel);
  }

  const duplicateFlags = rows.map(r => isDuplicate(r, existingTransactions));
  const duplicateCount = duplicateFlags.filter(Boolean).length;

  const toggleRow = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((_, i) => i)));
    }
  };

  const updateRow = (index: number, field: keyof ExcelRow, value: string | null) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  // Bulk assign
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [bulkAccount, setBulkAccount] = useState<string | null>(null);

  const applyBulkCategory = () => {
    if (!bulkCategory) return;
    const val = bulkCategory === '__none__' ? null : bulkCategory;
    setRows(prev => prev.map(r => ({ ...r, category_id: r.category_id || val })));
  };

  const applyBulkAccount = () => {
    if (!bulkAccount) return;
    const val = bulkAccount === '__none__' ? null : bulkAccount;
    setRows(prev => prev.map(r => ({ ...r, account_id: r.account_id || val })));
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const selectedCount = selected.size;

  const handleConfirm = () => {
    const selectedRows = rows.filter((_, i) => selected.has(i));
    onConfirm(selectedRows);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Revisar Importação ({rows.length} transações)</DialogTitle>
          <DialogDescription>
            Atribua categorias, contas e contas contábeis antes de confirmar. Campos em branco serão importados sem preenchimento.
          </DialogDescription>
          {duplicateCount > 0 && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{duplicateCount}</strong> possíveis duplicatas encontradas (mesmo valor, data e conta). Elas estão desmarcadas por padrão. Marque para incluí-las.
              </span>
            </div>
          )}
        </DialogHeader>

        {/* Bulk actions */}
        <div className="flex flex-wrap items-end gap-3 py-2 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Categoria (todas sem categoria)</span>
            <div className="flex gap-1">
              <Select value={bulkCategory || '__none__'} onValueChange={setBulkCategory}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Selecionar..." />
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
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyBulkCategory}>Aplicar</Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Conta (todas sem conta)</span>
            <div className="flex gap-1">
              <Select value={bulkAccount || '__none__'} onValueChange={setBulkAccount}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Selecionar..." />
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
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyBulkAccount}>Aplicar</Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-center px-2 py-2 w-8">
                    <Checkbox
                      checked={selected.size === rows.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-2">Data</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase px-3 py-2">Valor</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-2">Descrição</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-2">Categoria</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-2">Conta</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase px-3 py-2">Conta Contábil</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const cat = categories.find(c => c.id === row.category_id);
                  const acc = accounts.find(a => a.id === row.account_id);
                  const ca = chartAccounts.find(c => c.id === row.chart_account_id);
                  const dup = duplicateFlags[i];
                  const isSelected = selected.has(i);
                  return (
                    <tr key={i} className={`border-b last:border-0 hover:bg-muted/30 ${dup ? 'bg-amber-50/50' : ''} ${!isSelected ? 'opacity-50' : ''}`}>
                      <td className="text-center px-2 py-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center justify-center gap-1">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleRow(i)}
                                />
                                {dup && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                              </div>
                            </TooltipTrigger>
                            {dup && (
                              <TooltipContent>
                                <p className="text-xs">Possível duplicata: já existe lançamento com mesmo valor, data e conta.</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className={`px-3 py-2 font-mono text-xs font-semibold text-right whitespace-nowrap ${row.amount >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[200px]">
                        <p className="truncate">{row.description}</p>
                        {row.memo && <p className="text-muted-foreground truncate text-[11px]">{row.memo}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <Popover open={openCatPopover === i} onOpenChange={open => setOpenCatPopover(open ? i : null)}>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 h-7 w-32 px-2 text-xs border rounded-md bg-background hover:bg-muted/50 text-left">
                              {cat ? (
                                <>
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                                  <span className="truncate">{cat.name}</span>
                                </>
                              ) : <span className="text-muted-foreground">—</span>}
                              <ChevronsUpDown className="ml-auto h-3 w-3 opacity-50" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar..." className="h-8 text-xs" />
                              <CommandList>
                                <CommandEmpty className="py-2 text-center text-xs">Nenhuma.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem value="__none__" onSelect={() => { updateRow(i, 'category_id', null); setOpenCatPopover(null); }} className="text-xs">
                                    <span className="text-muted-foreground">Sem categoria</span>
                                    {!row.category_id && <Check className="ml-auto h-3 w-3" />}
                                  </CommandItem>
                                  {categories.map(c => (
                                    <CommandItem key={c.id} value={c.name} onSelect={() => { updateRow(i, 'category_id', c.id); setOpenCatPopover(null); }} className="text-xs">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                                        {c.name}
                                      </span>
                                      {row.category_id === c.id && <Check className="ml-auto h-3 w-3" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="px-3 py-2">
                        <Select value={row.account_id || '__none__'} onValueChange={val => updateRow(i, 'account_id', val === '__none__' ? null : val)}>
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue>
                              {acc ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: acc.color }} />
                                  {acc.name}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </SelectValue>
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
                      </td>
                      <td className="px-3 py-2">
                        <Popover open={openChartPopover === i} onOpenChange={open => setOpenChartPopover(open ? i : null)}>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 h-7 w-40 px-2 text-xs border rounded-md bg-background hover:bg-muted/50 text-left">
                              {ca ? (
                                <span className="truncate"><span className="font-mono text-muted-foreground">{ca.code}</span> {ca.name}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                              <ChevronsUpDown className="ml-auto h-3 w-3 opacity-50" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar..." className="h-8 text-xs" />
                              <CommandList>
                                <CommandEmpty className="py-2 text-center text-xs">Nenhuma.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem value="__none__" onSelect={() => { updateRow(i, 'chart_account_id', null); setOpenChartPopover(null); }} className="text-xs">
                                    <span className="text-muted-foreground">Sem conta contábil</span>
                                    {!row.chart_account_id && <Check className="ml-auto h-3 w-3" />}
                                  </CommandItem>
                                  {chartAccounts.map(c => (
                                    <CommandItem key={c.id} value={`${c.code} ${c.name}`} onSelect={() => { updateRow(i, 'chart_account_id', c.id); setOpenChartPopover(null); }} className="text-xs">
                                      <span className="font-mono text-muted-foreground mr-1">{c.code}</span> {c.name}
                                      {row.chart_account_id === c.id && <Check className="ml-auto h-3 w-3" />}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            Confirmar Importação ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelImportReviewDialog;
