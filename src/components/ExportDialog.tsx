import { useState } from 'react';
import { Transaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportColumn {
  key: string;
  label: string;
}

const ALL_COLUMNS: ExportColumn[] = [
  { key: 'date', label: 'Data' },
  { key: 'description', label: 'Descrição' },
  { key: 'memo', label: 'Memo' },
  { key: 'amount', label: 'Valor' },
  { key: 'category', label: 'Categoria' },
  { key: 'account', label: 'Conta' },
  { key: 'chart_account', label: 'Conta Contábil' },
];

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

interface ExportDialogProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
}

const ExportDialog = ({ transactions, categories, accounts, chartAccounts }: ExportDialogProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(['date', 'description', 'amount']));
  const [open, setOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState<string>('__all__');
  const [exportYear, setExportYear] = useState<string>(currentYear.toString());

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatDate = (date: string) => {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  };

  const buildRows = (txs: Transaction[]) => {
    const cols = ALL_COLUMNS.filter(c => selected.has(c.key));
    return txs.map(tx => {
      const row: Record<string, string | number> = {};
      for (const col of cols) {
        switch (col.key) {
          case 'date': row[col.label] = formatDate(tx.date); break;
          case 'description': row[col.label] = tx.description; break;
          case 'memo': row[col.label] = tx.memo || ''; break;
          case 'amount': row[col.label] = Number(tx.amount); break;
          case 'category': {
            const cat = categories.find(c => c.id === tx.category_id);
            row[col.label] = cat?.name || '';
            break;
          }
          case 'account': {
            const acc = accounts.find(a => a.id === tx.account_id);
            row[col.label] = acc?.name || '';
            break;
          }
          case 'chart_account': {
            const ca = chartAccounts.find(c => c.id === (tx as any).chart_account_id);
            row[col.label] = ca ? `${ca.code} - ${ca.name}` : '';
            break;
          }
        }
      }
      return row;
    });
  };

  const styleSheet = (ws: XLSX.WorkSheet, rowCount: number) => {
    const cols = ALL_COLUMNS.filter(c => selected.has(c.key));
    // Set column widths
    ws['!cols'] = cols.map(col => {
      if (col.key === 'description') return { wch: 40 };
      if (col.key === 'memo') return { wch: 30 };
      if (col.key === 'chart_account') return { wch: 30 };
      if (col.key === 'category' || col.key === 'account') return { wch: 20 };
      if (col.key === 'amount') return { wch: 15 };
      return { wch: 12 };
    });

    // Format amount column as currency
    const amountIdx = cols.findIndex(c => c.key === 'amount');
    if (amountIdx >= 0) {
      for (let r = 1; r <= rowCount; r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c: amountIdx });
        if (ws[cellRef]) {
          ws[cellRef].z = '#,##0.00';
        }
      }
    }

    return ws;
  };

  const getFilteredTransactions = () => {
    let filtered = transactions;
    const year = exportYear !== '__all__' ? Number(exportYear) : null;
    const month = exportMonth !== '__all__' ? Number(exportMonth) : null;

    if (year) {
      filtered = filtered.filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === year;
      });
    }
    if (month) {
      filtered = filtered.filter(tx => {
        const d = new Date(tx.date);
        return d.getMonth() + 1 === month;
      });
    }
    return filtered;
  };

  const handleExport = () => {
    const filtered = getFilteredTransactions();
    const pagar = filtered.filter(t => Number(t.amount) < 0);
    const receber = filtered.filter(t => Number(t.amount) >= 0);

    const wb = XLSX.utils.book_new();

    // Aba A Pagar
    const pagarRows = buildRows(pagar);
    const wsPagar = styleSheet(XLSX.utils.json_to_sheet(pagarRows.length > 0 ? pagarRows : [{}]), pagarRows.length);
    XLSX.utils.book_append_sheet(wb, wsPagar, 'A Pagar');

    // Aba A Receber
    const receberRows = buildRows(receber);
    const wsReceber = styleSheet(XLSX.utils.json_to_sheet(receberRows.length > 0 ? receberRows : [{}]), receberRows.length);
    XLSX.utils.book_append_sheet(wb, wsReceber, 'A Receber');

    const monthLabel = exportMonth !== '__all__' ? MONTHS[Number(exportMonth) - 1] : 'Todos';
    const yearLabel = exportYear !== '__all__' ? exportYear : 'Todos';
    XLSX.writeFile(wb, `transacoes_${yearLabel}_${monthLabel}.xlsx`);
    setOpen(false);
  };

  const filteredCount = getFilteredTransactions().length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-1.5" />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Exportar para Excel</DialogTitle>
        </DialogHeader>

        {/* Período */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Período</p>
          <div className="flex gap-2">
            <Select value={exportYear} onValueChange={v => { setExportYear(v); if (v === '__all__') setExportMonth('__all__'); }}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos anos</SelectItem>
                {YEARS.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={exportMonth} onValueChange={setExportMonth} disabled={exportYear === '__all__'}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos meses</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Colunas */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Colunas</p>
          <div className="space-y-1">
            {ALL_COLUMNS.map(col => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors">
                <Checkbox
                  checked={selected.has(col.key)}
                  onCheckedChange={() => toggle(col.key)}
                />
                <span className="text-sm">{col.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleExport} disabled={selected.size === 0 || filteredCount === 0}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar ({filteredCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
