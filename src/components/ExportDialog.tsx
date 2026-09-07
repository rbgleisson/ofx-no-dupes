import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { Transaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { exportDemonstrativo, exportListagem } from '@/lib/excelExport';
import { toast } from 'sonner';

interface ExportColumn {
  key: string;
  label: string;
}

/** Definição única das colunas exportáveis, usada por todos os modos. */
export const ALL_COLUMNS: ExportColumn[] = [
  { key: 'date', label: 'Data' },
  { key: 'description', label: 'Descrição' },
  { key: 'memo', label: 'Memo' },
  { key: 'amount', label: 'Valor' },
  { key: 'category_code', label: 'Código Categoria' },
  { key: 'category', label: 'Categoria' },
  { key: 'account', label: 'Conta' },
  { key: 'chart_account', label: 'Conta Contábil' },
  { key: 'chart_account_code', label: 'Código Contábil' },
];

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

export interface ExportDialogProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
  /**
   * 'database' — busca todos os lançamentos da organização e aplica filtro próprio de mês/ano,
   *              com os modos Demonstrativo / Listagem.
   * 'current'  — exporta apenas a lista já filtrada recebida por prop.
   */
  source?: 'database' | 'current';
  /** Nome do arquivo (modo 'current'). */
  fileName?: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline';
  triggerClassName?: string;
}

const DEFAULT_DB_COLUMNS = ['date', 'description', 'amount'];
const DEFAULT_CURRENT_COLUMNS = [
  'date', 'description', 'amount', 'category_code', 'category', 'account', 'chart_account', 'chart_account_code',
];

const ExportDialog = ({
  transactions,
  categories,
  accounts,
  chartAccounts,
  source = 'database',
  fileName,
  triggerLabel,
  triggerVariant,
  triggerClassName,
}: ExportDialogProps) => {
  const fromDb = source === 'database';
  const { organizationId } = useOrganization();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(fromDb ? DEFAULT_DB_COLUMNS : DEFAULT_CURRENT_COLUMNS)
  );
  const [open, setOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState<string>('__all__');
  const [exportYear, setExportYear] = useState<string>(currentYear.toString());
  const [exportType, setExportType] = useState<'listagem' | 'demonstrativo'>('demonstrativo');
  const [companyName, setCompanyName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [onlyReal, setOnlyReal] = useState(true);

  useEffect(() => {
    if (!open || !fromDb) return;
    if (!organizationId) { setAllTransactions([]); return; }
    const fetchAll = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('date', { ascending: false });
      setAllTransactions((data as Transaction[]) || []);
    };
    fetchAll();
  }, [open, organizationId, fromDb]);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getFilteredTransactions = () => {
    let filtered = fromDb ? allTransactions : transactions;
    if (onlyReal) filtered = filtered.filter(tx => !(tx as any).is_transfer);
    if (!fromDb) return filtered;

    const year = exportYear !== '__all__' ? Number(exportYear) : null;
    const month = exportMonth !== '__all__' ? Number(exportMonth) : null;

    if (year) filtered = filtered.filter(tx => new Date(tx.date).getFullYear() === year);
    if (month) filtered = filtered.filter(tx => new Date(tx.date).getMonth() + 1 === month);
    return filtered;
  };

  const buildPeriodStrings = () => {
    const year = exportYear !== '__all__' ? Number(exportYear) : null;
    const month = exportMonth !== '__all__' ? Number(exportMonth) : null;

    if (year && month) {
      const lastDay = new Date(year, month, 0).getDate();
      const yy = String(year).slice(-2);
      return {
        start: `01/${String(month).padStart(2, '0')}/${yy}`,
        end: `${lastDay}/${String(month).padStart(2, '0')}/${yy}`,
      };
    } else if (year) {
      const yy = String(year).slice(-2);
      return { start: `01/01/${yy}`, end: `31/12/${yy}` };
    }
    return { start: '01/01/25', end: '31/12/25' };
  };

  const handleExport = async () => {
    const filtered = getFilteredTransactions();
    if (!fromDb && filtered.length === 0) {
      toast.warning('Nenhum lançamento para exportar.');
      return;
    }
    if (selected.size === 0) {
      toast.warning('Selecione pelo menos uma coluna.');
      return;
    }
    setExporting(true);
    try {
      if (fromDb && exportType === 'demonstrativo') {
        const { start, end } = buildPeriodStrings();
        await exportDemonstrativo(
          filtered, chartAccounts, categories, accounts, selected,
          companyName || 'EMPRESA', start, end,
        );
      } else {
        const monthLabel = exportMonth !== '__all__' ? MONTHS[Number(exportMonth) - 1] : 'Todos';
        const yearLabel = exportYear !== '__all__' ? exportYear : 'Todos';
        await exportListagem(
          filtered, categories, accounts, chartAccounts, selected,
          fileName || `transacoes_${yearLabel}_${monthLabel}.xlsx`,
        );
        if (!fromDb) toast.success('Exportação concluída!');
      }
      setOpen(false);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Erro ao exportar: ' + (err?.message || ''));
    } finally {
      setExporting(false);
    }
  };

  const filteredCount = getFilteredTransactions().length;
  const showColumns = !fromDb || exportType === 'listagem';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={triggerVariant ?? (fromDb ? 'default' : 'outline')}
          className={triggerClassName ?? (fromDb ? 'bg-teal-700 hover:bg-teal-800 text-white border-0' : undefined)}
        >
          <Download className="w-4 h-4 mr-1.5" />
          {triggerLabel ?? (fromDb ? 'Exportar' : 'Exportar Excel')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fromDb ? 'Exportar para Excel' : 'Exportar Lançamentos'}</DialogTitle>
        </DialogHeader>

        {fromDb ? (
          <>
            {/* Tipo de exportação */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Tipo</p>
              <Select value={exportType} onValueChange={(v) => setExportType(v as 'listagem' | 'demonstrativo')}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demonstrativo">Demonstrativo da Tesouraria</SelectItem>
                  <SelectItem value="listagem">Listagem de Lançamentos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportType === 'demonstrativo' && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Nome da Empresa / Igreja</p>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: Igreja Assembleia de Deus"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
            )}

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
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {filteredCount} lançamento{filteredCount !== 1 ? 's' : ''} serão exportados.
          </p>
        )}

        {/* Somente movimentos reais */}
        <label className="flex items-start gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
          <Checkbox checked={onlyReal} onCheckedChange={() => setOnlyReal(v => !v)} className="mt-0.5" />
          <span className="text-xs leading-snug">
            Somente receitas e despesas reais
            <span className="block text-muted-foreground">
              Exclui aplicações, resgates e transferências internas (mesma titularidade/CNPJ).
            </span>
          </span>
        </label>

        {showColumns && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Colunas</p>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
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
        )}

        {fromDb && exportType === 'demonstrativo' && (
          <p className="text-xs text-muted-foreground">
            Gera o formulário do Demonstrativo Mensal da Tesouraria com bordas, cabeçalho e valores preenchidos automaticamente.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleExport} disabled={(showColumns && selected.size === 0) || exporting}>
            <Download className="w-4 h-4 mr-1.5" />
            {exporting ? 'Exportando...' : fromDb ? `Exportar (${filteredCount})` : 'Exportar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
