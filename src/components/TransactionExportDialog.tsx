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
import { exportListagem } from '@/lib/excelExport';
import { toast } from 'sonner';

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
  { key: 'chart_account_code', label: 'Código Contábil' },
];

interface TransactionExportDialogProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
  fileName: string;
}

const TransactionExportDialog = ({
  transactions,
  categories,
  accounts,
  chartAccounts,
  fileName,
}: TransactionExportDialogProps) => {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['date', 'description', 'amount', 'category', 'account', 'chart_account', 'chart_account_code'])
  );
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = async () => {
    if (transactions.length === 0) {
      toast.warning('Nenhum lançamento para exportar.');
      return;
    }
    if (selected.size === 0) {
      toast.warning('Selecione pelo menos uma coluna.');
      return;
    }
    setExporting(true);
    try {
      await exportListagem(transactions, categories, accounts, chartAccounts, selected, fileName);
      toast.success('Exportação concluída!');
      setOpen(false);
    } catch (err: any) {
      console.error('Export lançamentos error:', err);
      toast.error('Erro ao exportar: ' + (err?.message || ''));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="w-4 h-4 mr-1.5" />
          Exportar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Exportar Lançamentos</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {transactions.length} lançamento{transactions.length !== 1 ? 's' : ''} serão exportados.
        </p>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Colunas</p>
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {ALL_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors"
              >
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
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={selected.size === 0 || exporting}
          >
            <Download className="w-4 h-4 mr-1.5" />
            {exporting ? 'Exportando...' : 'Exportar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionExportDialog;
