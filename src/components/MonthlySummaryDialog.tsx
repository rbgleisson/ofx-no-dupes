import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Download } from 'lucide-react';
import { Category } from '@/components/CategoriesManager';
import { exportMonthlySummary } from '@/lib/monthlySummaryExport';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

interface Props {
  categories: Category[];
  organizationId: string | null;
  onSuccess?: () => void;
  onError?: () => void;
  trigger?: React.ReactNode;
}

const MonthlySummaryDialog = ({ categories, organizationId, onSuccess, onError, trigger }: Props) => {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      await exportMonthlySummary(categories, organizationId, Number(year), Number(month));
      onSuccess?.();
      setOpen(false);
    } catch {
      onError?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <BarChart3 className="w-4 h-4 mr-2 text-blue-600" />
            Resumo Mensal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Resumo Mensal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Gera um Excel com as abas: Entradas por categoria, Saídas por categoria e Resumo (saldo).
          </p>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Período</p>
            <div className="flex gap-2">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleExport} disabled={loading}>
              <Download className="w-4 h-4 mr-1.5" />
              {loading ? 'Exportando...' : 'Exportar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MonthlySummaryDialog;
