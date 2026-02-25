import { useState } from 'react';
import { Transaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { Button } from '@/components/ui/button';
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
  const [open, setOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState<string>('__all__');
  const [exportYear, setExportYear] = useState<string>(currentYear.toString());

  const formatDate = (date: string) => {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
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

  const buildRows = (txs: Transaction[]) => {
    return txs.map((tx, idx) => {
      const cat = categories.find(c => c.id === tx.category_id);
      const acc = accounts.find(a => a.id === tx.account_id);
      const ca = chartAccounts.find(c => c.id === tx.chart_account_id);

      return {
        'ID': idx + 1,
        'Descrição': tx.description,
        'Valor (R$)': Number(tx.amount),
        'Data (DD/MM/AAAA)': formatDate(tx.date),
        'Categoria': cat?.name || '',
        'Conta': acc?.name || '',
        'Conta Lcto': ca ? `${ca.code} - ${ca.name}` : '',
        'Doc?': tx.attachment_url ? 'Sim' : '',
        'Obs. Documento': tx.memo || '',
        'Status': '',
      };
    });
  };

  const styleSheet = (ws: XLSX.WorkSheet, rowCount: number) => {
    ws['!cols'] = [
      { wch: 6 },   // ID
      { wch: 40 },  // Descrição
      { wch: 15 },  // Valor (R$)
      { wch: 16 },  // Data
      { wch: 20 },  // Categoria
      { wch: 20 },  // Conta
      { wch: 25 },  // Conta Lcto
      { wch: 6 },   // Doc?
      { wch: 30 },  // Obs. Documento
      { wch: 10 },  // Status
    ];

    // Format amount column (index 2) as currency
    for (let r = 1; r <= rowCount; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: 2 });
      if (ws[cellRef]) {
        ws[cellRef].z = '#,##0.00';
      }
    }

    return ws;
  };

  const handleExport = () => {
    const filtered = getFilteredTransactions();

    const wb = XLSX.utils.book_new();

    const rows = buildRows(filtered);
    const ws = styleSheet(
      XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]),
      rows.length
    );
    XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');

    const monthLabel = exportMonth !== '__all__' ? MONTHS[Number(exportMonth) - 1] : 'Todos';
    const yearLabel = exportYear !== '__all__' ? exportYear : 'Todos';
    XLSX.writeFile(wb, `lancamentos_${yearLabel}_${monthLabel}.xlsx`);
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

        <p className="text-xs text-muted-foreground">
          Colunas: ID, Descrição, Valor (R$), Data, Categoria, Conta, Conta Lcto, Doc?, Obs. Documento, Status
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleExport} disabled={filteredCount === 0}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar ({filteredCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
