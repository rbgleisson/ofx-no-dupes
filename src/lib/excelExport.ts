import ExcelJS from 'exceljs';
import { DEMONSTRATIVO_ROWS, TemplateRow } from '@/lib/demonstrativoTemplate';

// Types
interface ExportTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  memo?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  chart_account_id?: string | null;
  attachment_url?: string | null;
}

interface ChartAccount { id: string; code: string; name: string; }
interface Category { id: string; name: string; color: string; code?: string | null; }
interface Account { id: string; name: string; color: string; }

interface ExportColumn { key: string; label: string; }

const ALL_COLUMNS: ExportColumn[] = [
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

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const formatDate = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
};

// ===================== DEMONSTRATIVO =====================

export async function exportDemonstrativo(
  transactions: ExportTransaction[],
  chartAccounts: ChartAccount[],
  categories: Category[],
  accounts: Account[],
  selectedColumns: Set<string>,
  companyName: string,
  periodoStart: string,
  periodoEnd: string,
) {
  const wb = new ExcelJS.Workbook();

  // --- Sheet 1: Demonstrativo ---
  buildDemonstrativoSheet(wb, transactions, chartAccounts, companyName, periodoStart, periodoEnd);

  // --- Sheet 2 & 3: Listagem Entradas & Saídas (all columns) ---
  const allColKeys = new Set(ALL_COLUMNS.map(c => c.key));
  const entradas = transactions.filter(t => Number(t.amount) >= 0);
  const saidas = transactions.filter(t => Number(t.amount) < 0);

  buildListagemSheet(wb, 'Entradas', entradas, categories, accounts, chartAccounts, allColKeys);
  buildListagemSheet(wb, 'Saídas', saidas, categories, accounts, chartAccounts, allColKeys);

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `demonstrativo_${companyName.replace(/\s+/g, '_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildDemonstrativoSheet(
  wb: ExcelJS.Workbook,
  transactions: ExportTransaction[],
  chartAccounts: ChartAccount[],
  companyName: string,
  periodoStart: string,
  periodoEnd: string,
) {
  const ws = wb.addWorksheet('Demonstrativo');

  ws.columns = [
    { width: 50 },  // A - Descrição
    { width: 18 },  // B - Entradas
    { width: 18 },  // C - Saídas
    { width: 24 },  // D - Conta de Lançamento
  ];

  // Company header
  const headerRow = ws.addRow([companyName]);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, 4);
  headerRow.font = { bold: true, size: 14 };
  headerRow.alignment = { horizontal: 'center' };

  // Title
  const titleRow = ws.addRow(['DEMONSTRATIVO MENSAL DA TESOURARIA']);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, 4);
  titleRow.font = { bold: true, size: 12 };
  titleRow.alignment = { horizontal: 'center' };

  // Period
  const periodRow = ws.addRow([`PERÍODO DE ${periodoStart} A ${periodoEnd}`]);
  ws.mergeCells(ws.rowCount, 1, ws.rowCount, 4);
  periodRow.font = { bold: true, size: 10 };
  periodRow.alignment = { horizontal: 'center' };

  // Empty separator row
  ws.addRow([]);

  // Column headers
  const colHeaderRow = ws.addRow(['DESCRIÇÃO DE CONTA', 'ENTRADAS', 'SAÍDAS', 'CONTA DE LANÇAMENTO']);
  colHeaderRow.font = { bold: true, size: 10 };
  colHeaderRow.alignment = { horizontal: 'center' };
  colHeaderRow.eachCell((cell) => {
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  // Build amounts map
  const codeToAmounts: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.chart_account_id) {
      const ca = chartAccounts.find(c => c.id === tx.chart_account_id);
      if (ca) {
        codeToAmounts[ca.code] = (codeToAmounts[ca.code] || 0) + Math.abs(Number(tx.amount));
      }
    }
  }

  let totalEntradas = 0;
  let totalSaidas = 0;

  for (const row of DEMONSTRATIVO_ROWS) {
    if (row.type === 'header') continue;

    if (row.type === 'section') {
      const r = ws.addRow([row.description, '', '', '']);
      r.font = { bold: true, size: 10 };
      r.eachCell((cell) => {
        cell.border = thinBorder;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      });
      continue;
    }

    if (row.type === 'blank') {
      ws.addRow([]);
      continue;
    }

    if (row.type === 'text' || row.type === 'signature') {
      const r = ws.addRow([row.description]);
      ws.mergeCells(ws.rowCount, 1, ws.rowCount, 4);
      if (row.type === 'text') r.font = { size: 9, italic: true };
      continue;
    }

    if (row.type === 'entry') {
      let value: number | null = null;
      const codeLabel = row.codes?.join('/') || '';

      if (row.codes && row.codes.length > 0) {
        let sum = 0;
        for (const code of row.codes) sum += codeToAmounts[code] || 0;
        if (sum > 0) value = sum;
      }

      let entradaVal: number | string = '';
      let saidaVal: number | string = '';

      if (row.column === 'entradas') {
        if (value) { entradaVal = value; totalEntradas += value; }
        saidaVal = '';
      } else if (row.column === 'saidas') {
        if (value) { saidaVal = value; totalSaidas += value; }
        entradaVal = '';
      }

      const r = ws.addRow([row.description, entradaVal, saidaVal, codeLabel]);
      r.font = { size: 10 };
      r.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        if (colNumber === 2 || colNumber === 3) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
      continue;
    }

    if (row.type === 'subtotal') {
      let val: number | string = '';
      let col = 2; // default entradas
      if (row.key === 'B') { val = totalEntradas || ''; col = 2; }
      else if (row.key === 'C') { val = totalSaidas || ''; col = 3; }

      const r = ws.addRow([row.description, row.key === 'C' ? '' : val, row.key === 'C' ? val : '', '']);
      r.font = { bold: true, size: 10 };
      r.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        if (colNumber === 2 || colNumber === 3) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
      continue;
    }

    if (row.type === 'total') {
      let val: number | string = '';
      let colIdx = 2;

      if (row.key === 'R_B' || row.key === 'R_AB') { val = totalEntradas || ''; colIdx = 2; }
      else if (row.key === 'R_C') { val = totalSaidas || ''; colIdx = 3; }
      else if (row.key === 'R_DISP') { val = totalEntradas - totalSaidas || ''; colIdx = 2; }

      const cells: (string | number)[] = [row.description, '', '', ''];
      if (colIdx === 2) cells[1] = val;
      else cells[2] = val;

      const r = ws.addRow(cells);
      r.font = { bold: true, size: 11 };
      r.eachCell((cell, colNumber) => {
        cell.border = thinBorder;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
        if (colNumber === 2 || colNumber === 3) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
      continue;
    }
  }
}

// ===================== LISTAGEM =====================

function buildListagemSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  transactions: ExportTransaction[],
  categories: Category[],
  accounts: Account[],
  chartAccounts: ChartAccount[],
  selectedColumns: Set<string>,
) {
  const ws = wb.addWorksheet(sheetName);
  const cols = ALL_COLUMNS.filter(c => selectedColumns.has(c.key));

  // Column widths
  ws.columns = cols.map(col => {
    if (col.key === 'description') return { width: 42 };
    if (col.key === 'memo') return { width: 32 };
    if (col.key === 'chart_account') return { width: 32 };
    if (col.key === 'category' || col.key === 'account') return { width: 22 };
    if (col.key === 'amount') return { width: 16 };
    return { width: 14 };
  });

  // Header row
  const headerRow = ws.addRow(cols.map(c => c.label));
  headerRow.font = { bold: true, size: 10 };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell) => {
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  // Data rows
  let totalAmount = 0;
  const amountColIdx = cols.findIndex(c => c.key === 'amount');

  for (const tx of transactions) {
    const values: (string | number)[] = [];
    for (const col of cols) {
      switch (col.key) {
        case 'date': values.push(formatDate(tx.date)); break;
        case 'description': values.push(tx.description); break;
        case 'memo': values.push(tx.memo || ''); break;
        case 'amount': {
          const amt = Number(tx.amount);
          totalAmount += amt;
          values.push(amt);
          break;
        }
        case 'category': {
          const cat = categories.find(c => c.id === tx.category_id);
          values.push(cat?.name || '');
          break;
        }
        case 'category_code': {
          const cat = categories.find(c => c.id === tx.category_id);
          values.push(cat?.code || '');
          break;
        }
        case 'account': {
          const acc = accounts.find(a => a.id === tx.account_id);
          values.push(acc?.name || '');
          break;
        }
        case 'chart_account': {
          const ca = chartAccounts.find(c => c.id === tx.chart_account_id);
          values.push(ca ? `${ca.code} - ${ca.name}` : '');
          break;
        }
        case 'chart_account_code': {
          const ca = chartAccounts.find(c => c.id === tx.chart_account_id);
          values.push(ca ? ca.code : '');
          break;
        }
      }
    }

    const r = ws.addRow(values);
    r.font = { size: 10 };
    r.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      const colDef = cols[colNumber - 1];
      if (colDef?.key === 'amount') {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
    });
  }

  // Totals row
  if (amountColIdx >= 0 && transactions.length > 0) {
    const totalValues: (string | number)[] = cols.map((col, idx) => {
      if (idx === 0) return `TOTAL (${transactions.length} lançamentos)`;
      if (col.key === 'amount') return totalAmount;
      return '';
    });

    const totalRow = ws.addRow(totalValues);
    totalRow.font = { bold: true, size: 11 };
    totalRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      const colDef = cols[colNumber - 1];
      if (colDef?.key === 'amount') {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
    });
  }
}

// ===================== LISTAGEM ONLY EXPORT =====================

export async function exportListagem(
  transactions: ExportTransaction[],
  categories: Category[],
  accounts: Account[],
  chartAccounts: ChartAccount[],
  selectedColumns: Set<string>,
  fileName: string,
) {
  const wb = new ExcelJS.Workbook();

  const pagar = transactions.filter(t => Number(t.amount) < 0);
  const receber = transactions.filter(t => Number(t.amount) >= 0);

  buildListagemSheet(wb, 'A Pagar', pagar, categories, accounts, chartAccounts, selectedColumns);
  buildListagemSheet(wb, 'A Receber', receber, categories, accounts, chartAccounts, selectedColumns);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
