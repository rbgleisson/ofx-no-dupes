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
import { DEMONSTRATIVO_ROWS } from '@/lib/demonstrativoTemplate';

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
  const [exportType, setExportType] = useState<'listagem' | 'demonstrativo'>('demonstrativo');

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

  // ---- Listagem export ----
  const buildListagemRows = (txs: Transaction[]) => {
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

  const styleListagemSheet = (ws: XLSX.WorkSheet, rowCount: number) => {
    const cols = ALL_COLUMNS.filter(c => selected.has(c.key));
    ws['!cols'] = cols.map(col => {
      if (col.key === 'description') return { wch: 40 };
      if (col.key === 'memo') return { wch: 30 };
      if (col.key === 'chart_account') return { wch: 30 };
      if (col.key === 'category' || col.key === 'account') return { wch: 20 };
      if (col.key === 'amount') return { wch: 15 };
      return { wch: 12 };
    });
    const amountIdx = cols.findIndex(c => c.key === 'amount');
    if (amountIdx >= 0) {
      for (let r = 1; r <= rowCount; r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c: amountIdx });
        if (ws[cellRef]) ws[cellRef].z = '#,##0.00';
      }
    }
    return ws;
  };

  const handleExportListagem = () => {
    const filtered = getFilteredTransactions();
    const pagar = filtered.filter(t => Number(t.amount) < 0);
    const receber = filtered.filter(t => Number(t.amount) >= 0);

    const wb = XLSX.utils.book_new();
    const pagarRows = buildListagemRows(pagar);
    const wsPagar = styleListagemSheet(XLSX.utils.json_to_sheet(pagarRows.length > 0 ? pagarRows : [{}]), pagarRows.length);
    XLSX.utils.book_append_sheet(wb, wsPagar, 'A Pagar');

    const receberRows = buildListagemRows(receber);
    const wsReceber = styleListagemSheet(XLSX.utils.json_to_sheet(receberRows.length > 0 ? receberRows : [{}]), receberRows.length);
    XLSX.utils.book_append_sheet(wb, wsReceber, 'A Receber');

    const monthLabel = exportMonth !== '__all__' ? MONTHS[Number(exportMonth) - 1] : 'Todos';
    const yearLabel = exportYear !== '__all__' ? exportYear : 'Todos';
    XLSX.writeFile(wb, `transacoes_${yearLabel}_${monthLabel}.xlsx`);
    setOpen(false);
  };

  // ---- Demonstrativo export ----
  const handleExportDemonstrativo = () => {
    const filtered = getFilteredTransactions();
    const year = exportYear !== '__all__' ? Number(exportYear) : null;
    const month = exportMonth !== '__all__' ? Number(exportMonth) : null;

    // Build a map: chart_account_code -> sum of amounts (saidas are negative, entradas positive)
    const codeToAmounts: Record<string, number> = {};
    for (const tx of filtered) {
      if (tx.chart_account_id) {
        const ca = chartAccounts.find(c => c.id === tx.chart_account_id);
        if (ca) {
          codeToAmounts[ca.code] = (codeToAmounts[ca.code] || 0) + Math.abs(Number(tx.amount));
        }
      }
    }

    // Build period string
    let periodoStart = '01/01/25';
    let periodoEnd = '31/12/25';
    if (year && month) {
      const lastDay = new Date(year, month, 0).getDate();
      const yy = String(year).slice(-2);
      periodoStart = `01/${String(month).padStart(2, '0')}/${yy}`;
      periodoEnd = `${lastDay}/${String(month).padStart(2, '0')}/${yy}`;
    } else if (year) {
      const yy = String(year).slice(-2);
      periodoStart = `01/01/${yy}`;
      periodoEnd = `31/12/${yy}`;
    }

    // Build worksheet data as array of arrays
    const data: (string | number | null)[][] = [];

    // Title
    data.push(['DEMONSTRATIVO MENSAL DA TESOURARIA', '', '', '']);
    data.push(['PERIODO DE', periodoStart, 'A', periodoEnd]);
    data.push(['DESCRIÇÃO DE CONTA', 'ENTRADAS', 'SAIDAS', 'CONTA DE LANÇAMENTO']);

    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const row of DEMONSTRATIVO_ROWS) {
      if (row.type === 'header') continue; // already added above

      if (row.type === 'section') {
        data.push([row.description, '/////////////', '/////////////', '/////////////////']);
        continue;
      }

      if (row.type === 'blank') {
        data.push(['', '', '', '']);
        continue;
      }

      if (row.type === 'text' || row.type === 'signature') {
        data.push([row.description, '', '', '']);
        continue;
      }

      if (row.type === 'entry') {
        let value: number | string = '';
        const codeLabel = row.codes?.join('/') || '';

        if (row.codes && row.codes.length > 0) {
          let sum = 0;
          for (const code of row.codes) {
            sum += codeToAmounts[code] || 0;
          }
          if (sum > 0) value = sum;
        }

        if (row.column === 'entradas') {
          if (typeof value === 'number') totalEntradas += value;
          data.push([row.description, value || '', '/////////////', codeLabel]);
        } else if (row.column === 'saidas') {
          if (typeof value === 'number') totalSaidas += value;
          data.push([row.description, '/////////////', value || '', codeLabel]);
        } else {
          data.push([row.description, '', '', codeLabel]);
        }
        continue;
      }

      if (row.type === 'subtotal') {
        if (row.key === 'A') {
          data.push([row.description, '', '/////////////', '/////////////////']);
        } else if (row.key === 'B') {
          data.push([row.description, totalEntradas || '', '/////////////', '/////////////////']);
        } else if (row.key === 'C') {
          data.push([row.description, '/////////////', totalSaidas || '', '/////////////////']);
        }
        continue;
      }

      if (row.type === 'total') {
        if (row.key === 'R_A') {
          data.push([row.description, '', '/////////////', '/////////////////']);
        } else if (row.key === 'R_B') {
          data.push([row.description, totalEntradas || '', '/////////////', '/////////////////']);
        } else if (row.key === 'R_AB') {
          data.push([row.description, totalEntradas || '', '/////////////', '/////////////////']);
        } else if (row.key === 'R_C') {
          data.push([row.description, '/////////////', totalSaidas || '', '/////////////////']);
        } else if (row.key === 'R_DISP') {
          const disp = totalEntradas - totalSaidas;
          data.push([row.description, disp || '', '', '/////////////////']);
        } else {
          data.push([row.description, '', '', '/////////////////']);
        }
        continue;
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws['!cols'] = [
      { wch: 48 },  // Descrição
      { wch: 16 },  // Entradas
      { wch: 16 },  // Saidas
      { wch: 22 },  // Conta de Lançamento
    ];

    // Format number cells as currency
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = 1; c <= 2; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '#,##0.00';
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Demonstrativo');

    // Add Listagem sheets (Entradas & Saídas)
    const entradas = filtered.filter(t => Number(t.amount) >= 0);
    const saidas = filtered.filter(t => Number(t.amount) < 0);

    const entradasRows = buildListagemRows(entradas);
    const wsEntradas = styleListagemSheet(XLSX.utils.json_to_sheet(entradasRows.length > 0 ? entradasRows : [{}]), entradasRows.length);
    XLSX.utils.book_append_sheet(wb, wsEntradas, 'Entradas');

    const saidasRows = buildListagemRows(saidas);
    const wsSaidas = styleListagemSheet(XLSX.utils.json_to_sheet(saidasRows.length > 0 ? saidasRows : [{}]), saidasRows.length);
    XLSX.utils.book_append_sheet(wb, wsSaidas, 'Saídas');

    const monthLabel = exportMonth !== '__all__' ? MONTHS[Number(exportMonth) - 1] : 'Todos';
    const yearLabel = exportYear !== '__all__' ? exportYear : 'Todos';
    XLSX.writeFile(wb, `demonstrativo_${yearLabel}_${monthLabel}.xlsx`);
    setOpen(false);
  };

  const handleExport = () => {
    if (exportType === 'demonstrativo') {
      handleExportDemonstrativo();
    } else {
      handleExportListagem();
    }
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

        {/* Colunas (only for listagem) */}
        {exportType === 'listagem' && (
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
        )}

        {exportType === 'demonstrativo' && (
          <p className="text-xs text-muted-foreground">
            Gera o formulário do Demonstrativo Mensal da Tesouraria com entradas e saídas preenchidas automaticamente pelo código da conta de lançamento.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleExport} disabled={exportType === 'listagem' && selected.size === 0}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar ({filteredCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
