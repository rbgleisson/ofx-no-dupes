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

interface ExportDialogProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
}

const ExportDialog = ({ transactions, categories, accounts, chartAccounts }: ExportDialogProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(['date', 'description', 'amount']));
  const [open, setOpen] = useState(false);

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

  const handleExport = () => {
    const cols = ALL_COLUMNS.filter(c => selected.has(c.key));
    const rows = transactions.map(tx => {
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

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transações');
    XLSX.writeFile(wb, `transacoes_${new Date().toISOString().split('T')[0]}.xlsx`);
    setOpen(false);
  };

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
        <p className="text-sm text-muted-foreground">Selecione as colunas que deseja exportar:</p>
        <div className="space-y-2 py-2">
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleExport} disabled={selected.size === 0}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar ({transactions.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
