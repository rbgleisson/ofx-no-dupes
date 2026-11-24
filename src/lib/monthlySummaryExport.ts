import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { fetchInvestmentSummary, type InvestmentSummary } from '@/lib/investmentPositions';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { computeMonthlyClosing, type CashBalanceAccount } from '@/lib/accountBalances';
import { fetchMonthlyOpeningBalance, fetchOpeningAnchors } from '@/lib/monthlyOpeningBalance';

export { fetchInvestmentSummary };

/**
 * Saldo consolidado das contas de aplicação (kind = 'investment') da organização,
 * a partir da última posição mensal registrada até o mês/ano informado.
 */
export async function fetchInvestmentBalance(
  organizationId: string | null,
  year: number,
  month: number,
): Promise<number> {
  const summary = await fetchInvestmentSummary(organizationId, year, month);
  return summary.totalSaldo;
}


interface Transaction {
  id: string;
  date: string;
  amount: number;
  account_id: string | null;
  category_id: string | null;
  chart_account_id: string | null;
  is_transfer?: boolean | null;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

interface ChartAccount {
  id: string;
  code: string;
  name: string;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// Converts hex color (#rrggbb or rrggbb) to ARGB for ExcelJS
const argb = (hex: string) => {
  const h = (hex || '#64748b').replace('#', '').padStart(6, '0').slice(0, 6);
  return `FF${h.toUpperCase()}`;
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Signature block: three stacked signature lines (Pastor Presidente, Tesoureiro, Comissão de Contas)
// Returns the next free row after the block.
function addSignatureBlock(sheet: ExcelJS.Worksheet, startRow: number, firstCol = 2, lastCol = 5): number {
  const cargos = ['Pastor Presidente', 'Tesoureiro', 'Comissão de Contas'];
  let row = startRow + 1;
  cargos.forEach((cargo, i) => {
    if (i > 0) row += 1; // extra spacing between signatures
    // Signature line: merged cell with bottom border, tall enough for manual signing
    sheet.mergeCells(row, firstCol, row, lastCol);
    sheet.getRow(row).height = 30;
    for (let c = firstCol; c <= lastCol; c++) {
      sheet.getCell(row, c).border = { bottom: { style: 'thin', color: { argb: 'FF0F172A' } } };
    }
    row++;
    // Role label centered below the line
    sheet.mergeCells(row, firstCol, row, lastCol);
    const lbl = sheet.getCell(row, firstCol);
    lbl.value = cargo;
    lbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
    lbl.alignment = { horizontal: 'center', vertical: 'top' };
    sheet.getRow(row).height = 16;
    row += 2;
  });
  return row;
}

export async function exportMonthlySummary(
  categories: Category[],
  organizationId: string | null,
  year: number,
  month: number,
  chartAccounts: ChartAccount[] = [],
  headerName: string = '',
  previousBalanceOverride?: number | null,
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  if (!organizationId) throw new Error('Organização não identificada. Faça login novamente.');

  const [transactions, previousTransactions, accountsResult, investmentSummary, openingAnchors] = await Promise.all([
    fetchAllRows<Transaction>(() => supabase
      .from('transactions')
      .select('id, date, amount, account_id, category_id, chart_account_id, is_transfer')
      .eq('organization_id', organizationId)
      .gte('date', startDate)
      .lt('date', endDate)),
    fetchAllRows<Transaction>(() => supabase
      .from('transactions')
      .select('id, date, amount, account_id, category_id, chart_account_id, is_transfer')
      .eq('organization_id', organizationId)
      .lt('date', startDate)),
    supabase
      .from('accounts')
      .select('id, opening_balance, opening_balance_date')
      .eq('organization_id', organizationId),
    fetchInvestmentSummary(organizationId, year, month),
    fetchOpeningAnchors(organizationId, year, month),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  const investmentBalance = investmentSummary.totalSaldo;
  const previousBalance = previousBalanceOverride ?? (await fetchMonthlyOpeningBalance(organizationId, year, month)).displayed;

  const catMap = new Map(categories.map(c => [c.id, c]));
  const chartMap = new Map(chartAccounts.map(c => [c.id, c]));

  const entriesByCategory = new Map<string, number>();
  const exitsByCategory = new Map<string, number>();
  const entriesByChart = new Map<string, number>();
  const exitsByChart = new Map<string, number>();
  let totalEntries = 0;
  let totalExits = 0;
  let countTx = 0;

  for (const tx of transactions) {
    if (tx.is_transfer) continue;
    countTx++;
    const catKey = tx.category_id || '__none__';
    const ca = tx.chart_account_id ? chartMap.get(tx.chart_account_id) : null;
    const chartKey = ca ? `${ca.code}||${ca.name}` : `||Sem Conta Contábil`;
    if (tx.amount >= 0) {
      entriesByCategory.set(catKey, (entriesByCategory.get(catKey) || 0) + tx.amount);
      entriesByChart.set(chartKey, (entriesByChart.get(chartKey) || 0) + tx.amount);
      totalEntries += tx.amount;
    } else {
      const abs = Math.abs(tx.amount);
      exitsByCategory.set(catKey, (exitsByCategory.get(catKey) || 0) + abs);
      exitsByChart.set(chartKey, (exitsByChart.get(chartKey) || 0) + abs);
      totalExits += abs;
    }
  }

  const closing = computeMonthlyClosing(
    previousBalance,
    totalEntries,
    totalExits,
    investmentSummary.byAccount.map(account => account.aplicado),
  );
  const monthName = MONTHS[month - 1];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Coinonia';
  wb.created = new Date();

  // ========== Sheet 1: DASHBOARD (printable) ==========
  const sheet = wb.addWorksheet('Resumo', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
      printTitlesRow: '',
    },
    views: [{ showGridLines: false }],
  });

  // Column widths (6 cols)
  sheet.columns = [
    { width: 4 },   // A - margin
    { width: 32 },  // B - label
    { width: 20 },  // C - % / SAÍDAS no KPI (valores monetários precisam caber)
    { width: 20 },  // D - value / ENTRADAS no KPI / Valor (R$)
    { width: 14 },  // E - bar
    { width: 4 },   // F - margin
  ];

  const C_PRIMARY = 'FF0891B2';      // cyan-600
  const C_PRIMARY_DARK = 'FF0E7490'; // cyan-700
  const C_GREEN = 'FF16A34A';
  const C_GREEN_BG = 'FFDCFCE7';
  const C_RED = 'FFDC2626';
  const C_RED_BG = 'FFFEE2E2';
  const C_BLUE_BG = 'FFE0F2FE';
  const C_GRAY = 'FF64748B';
  const C_GRAY_LIGHT = 'FFF1F5F9';
  const C_WHITE = 'FFFFFFFF';
  const C_DARK = 'FF0F172A';

  let row = 1;

  // === HEADER BAND ===
  sheet.getRow(row).height = 8;
  row++;

  // Org name
  sheet.mergeCells(row, 2, row, 5);
  const orgCell = sheet.getCell(row, 2);
  orgCell.value = headerName || 'Resumo Financeiro';
  orgCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: C_DARK } };
  orgCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 32;
  row++;

  // Subtitle
  sheet.mergeCells(row, 2, row, 5);
  const subCell = sheet.getCell(row, 2);
  subCell.value = `Resumo Mensal • ${monthName} / ${year}`;
  subCell.font = { name: 'Calibri', size: 12, color: { argb: C_PRIMARY_DARK }, italic: true };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 20;
  row++;

  // Divider bar
  sheet.mergeCells(row, 2, row, 5);
  const div = sheet.getCell(row, 2);
  div.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_PRIMARY } };
  sheet.getRow(row).height = 4;
  row += 2;

  // === KPI ROW ===
  sheet.getRow(row).height = 22;
  sheet.mergeCells(row, 2, row, 3);
  sheet.mergeCells(row, 4, row, 5);
  [
    { col: 2, text: 'ENTRADAS', color: C_GREEN, bg: C_GREEN_BG },
    { col: 4, text: 'SAÍDAS', color: C_RED, bg: C_RED_BG },
  ].forEach(k => {
    const c = sheet.getCell(row, k.col);
    c.value = k.text;
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: k.color } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
    c.border = {
      top: { style: 'medium', color: { argb: k.color } },
      left: { style: 'thin', color: { argb: k.color } },
      right: { style: 'thin', color: { argb: k.color } },
    };
  });
  row++;

  // Values row
  sheet.mergeCells(row, 2, row, 3);
  sheet.mergeCells(row, 4, row, 5);
  sheet.getRow(row).height = 38;
  const kpis = [
    { col: 2, val: totalEntries, color: C_GREEN, bg: C_GREEN_BG },
    { col: 4, val: totalExits, color: C_RED, bg: C_RED_BG },
  ];
  kpis.forEach(k => {
    const c = sheet.getCell(row, k.col);
    c.value = k.val;
    c.numFmt = '"R$" #,##0.00';
    c.font = { name: 'Calibri', size: 16, bold: true, color: { argb: k.color } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.bg } };
    c.border = {
      bottom: { style: 'medium', color: { argb: k.color } },
      left: { style: 'thin', color: { argb: k.color } },
      right: { style: 'thin', color: { argb: k.color } },
    };
  });
  row += 2;

  // === SECTION: Entradas por Categoria ===
  const buildCategorySection = (
    title: string,
    data: Map<string, number>,
    total: number,
    accent: string,
    accentBg: string,
  ) => {
    // Section title
    sheet.mergeCells(row, 2, row, 5);
    const t = sheet.getCell(row, 2);
    t.value = title;
    t.font = { name: 'Calibri', size: 13, bold: true, color: { argb: C_WHITE } };
    t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
    sheet.getRow(row).height = 24;
    row++;

    // Table header
    const headers = ['Categoria', '%', 'Valor (R$)', 'Distribuição'];
    headers.forEach((h, i) => {
      const c = sheet.getCell(row, 2 + i);
      c.value = h;
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_DARK } };
      c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', indent: i === 0 ? 1 : 0 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
      c.border = { bottom: { style: 'thin', color: { argb: C_GRAY } } };
    });
    sheet.getRow(row).height = 18;
    row++;

    const sorted = [...data.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      sheet.mergeCells(row, 2, row, 5);
      const empty = sheet.getCell(row, 2);
      empty.value = 'Sem lançamentos no período';
      empty.font = { italic: true, color: { argb: C_GRAY }, size: 10 };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(row).height = 24;
      row++;
    } else {
      sorted.forEach(([id, val], idx) => {
        const cat = catMap.get(id);
        const name = cat?.name || 'Sem Categoria';
        const color = argb(cat?.color || '#64748b');
        const pct = total > 0 ? val / total : 0;
        const isAlt = idx % 2 === 1;
        const rowBg = isAlt ? 'FFFAFAFA' : C_WHITE;

        sheet.getRow(row).height = 18;

        // Category name with color dot
        const nameCell = sheet.getCell(row, 2);
        nameCell.value = `●  ${name}`;
        nameCell.font = { name: 'Calibri', size: 10, color: { argb: color } };
        nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        const pctCell = sheet.getCell(row, 3);
        pctCell.value = pct;
        pctCell.numFmt = '0.0%';
        pctCell.font = { name: 'Calibri', size: 10, color: { argb: C_GRAY } };
        pctCell.alignment = { horizontal: 'center', vertical: 'middle' };
        pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        const valCell = sheet.getCell(row, 4);
        valCell.value = val;
        valCell.numFmt = '"R$" #,##0.00';
        valCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_DARK } };
        valCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // Bar visualization using REPT + block chars
        const barCell = sheet.getCell(row, 5);
        const blocks = Math.max(1, Math.round(pct * 20));
        barCell.value = '█'.repeat(blocks);
        barCell.font = { name: 'Consolas', size: 9, color: { argb: color } };
        barCell.alignment = { horizontal: 'left', vertical: 'middle' };
        barCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        row++;
      });
    }

    // Total row
    const totalLabel = sheet.getCell(row, 2);
    totalLabel.value = 'TOTAL';
    totalLabel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_WHITE } };
    totalLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };

    const pctTotal = sheet.getCell(row, 3);
    pctTotal.value = 1;
    pctTotal.numFmt = '0%';
    pctTotal.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_WHITE } };
    pctTotal.alignment = { horizontal: 'center', vertical: 'middle' };
    pctTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };

    const totalCell = sheet.getCell(row, 4);
    totalCell.value = total;
    totalCell.numFmt = '"R$" #,##0.00';
    totalCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_WHITE } };
    totalCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };

    const blank = sheet.getCell(row, 5);
    blank.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };

    sheet.getRow(row).height = 22;
    row += 2;
  };

  buildCategorySection('▲  ENTRADAS POR CATEGORIA', entriesByCategory, totalEntries, C_GREEN, C_GREEN_BG);
  buildCategorySection('▼  SAÍDAS POR CATEGORIA', exitsByCategory, totalExits, C_RED, C_RED_BG);

  // === CASCATA DE FECHAMENTO ===
  const closingLine = (label: string, value: number, color = C_DARK, bold = true) => {
    sheet.mergeCells(row, 2, row, 3);
    const labelCell = sheet.getCell(row, 2);
    labelCell.value = label;
    labelCell.font = { name: 'Calibri', size: 10, bold, color: { argb: C_GRAY } };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
    sheet.mergeCells(row, 4, row, 5);
    const valueCell = sheet.getCell(row, 4);
    valueCell.value = value;
    valueCell.numFmt = '"R$" #,##0.00';
    valueCell.font = { name: 'Calibri', size: 11, bold, color: { argb: color } };
    valueCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
    sheet.getRow(row).height = 20;
    row++;
  };

  closingLine('SALDO ANTERIOR', previousBalance);
  closingLine('(+) ENTRADAS REAIS', totalEntries, C_GREEN);
  closingLine('(–) SAÍDAS REAIS', totalExits, C_RED);
  closingLine('(=) SUBTOTAL', closing.subtotal, C_PRIMARY_DARK);
  for (const account of investmentSummary.byAccount) {
    closingLine(`(+) SALDO DE APLICAÇÃO ${account.name}`, account.aplicado, C_GREEN, false);
  }
  row++;

  sheet.mergeCells(row, 2, row, 5);
  const banner = sheet.getCell(row, 2);
  banner.value = `TOTAL GERAL`;
  banner.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_WHITE } };
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_PRIMARY_DARK } };
  sheet.getRow(row).height = 22;
  row++;

  sheet.mergeCells(row, 2, row, 5);
  const bigSaldo = sheet.getCell(row, 2);
  bigSaldo.value = closing.totalGeral;
  bigSaldo.numFmt = '"R$" #,##0.00';
  bigSaldo.font = {
    name: 'Calibri',
    size: 28,
    bold: true,
    color: { argb: closing.totalGeral >= 0 ? C_PRIMARY_DARK : C_RED },
  };
  bigSaldo.alignment = { horizontal: 'center', vertical: 'middle' };
  bigSaldo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_BLUE_BG } };
  bigSaldo.border = {
    bottom: { style: 'medium', color: { argb: C_PRIMARY_DARK } },
    left: { style: 'thin', color: { argb: C_PRIMARY_DARK } },
    right: { style: 'thin', color: { argb: C_PRIMARY_DARK } },
  };
  sheet.getRow(row).height = 48;
  row++;

  // Saldo acumulado em aplicações financeiras (não entra em entradas/saídas do mês)
  sheet.mergeCells(row, 2, row, 3);
  const invLbl = sheet.getCell(row, 2);
  invLbl.value = `SALDO EM APLICAÇÕES FINANCEIRAS (até ${monthName}/${year})`;
  invLbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C_GRAY } };
  invLbl.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
  invLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
  sheet.mergeCells(row, 4, row, 5);
  const invVal = sheet.getCell(row, 4);
  invVal.value = investmentBalance;
  invVal.numFmt = '"R$" #,##0.00';
  invVal.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C_PRIMARY_DARK } };
  invVal.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  invVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
  sheet.getRow(row).height = 20;
  row++;

  // Rendimento consolidado do mês nas aplicações
  const invLine = (label: string, value: number, bold: boolean) => {
    sheet.mergeCells(row, 2, row, 3);
    const l = sheet.getCell(row, 2);
    l.value = label;
    l.font = { name: 'Calibri', size: bold ? 10 : 9, bold, color: { argb: C_GRAY } };
    l.alignment = { horizontal: 'left', vertical: 'middle', indent: bold ? 1 : 2, wrapText: true };
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
    sheet.mergeCells(row, 4, row, 5);
    const v = sheet.getCell(row, 4);
    v.value = value;
    v.numFmt = '"R$" #,##0.00';
    v.font = { name: 'Calibri', size: bold ? 11 : 9, bold, color: { argb: C_PRIMARY_DARK } };
    v.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
    sheet.getRow(row).height = bold ? 20 : 16;
    row++;
  };

  invLine(`RENDIMENTO DAS APLICAÇÕES EM ${monthName}/${year}`, investmentSummary.totalRendimento, true);

  if (investmentSummary.byAccount.length > 1) {
    for (const a of investmentSummary.byAccount) {
      invLine(`${a.name} — saldo`, a.saldo, false);
      invLine(`${a.name} — rendimento do mês`, a.rendimento, false);
    }
  }

  row++;


  // Footer note
  sheet.mergeCells(row, 2, row, 5);
  const footer = sheet.getCell(row, 2);
  footer.value = `Gerado em ${new Date().toLocaleString('pt-BR')}  •  ${countTx} lançamento${countTx === 1 ? '' : 's'} no período`;
  footer.font = { name: 'Calibri', size: 9, italic: true, color: { argb: C_GRAY } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 18;
  row++;

  // === BLOCO DE ASSINATURAS ===
  row = addSignatureBlock(sheet, row);

  // Print area & header/footer
  sheet.pageSetup.printArea = `A1:F${row - 1}`;
  sheet.headerFooter.oddFooter = '&C&8Página &P de &N';

  // ========== Sheet 2: Por Conta Contábil (detalhe) ==========
  if (chartAccounts.length > 0) {
    const sh2 = wb.addWorksheet('Por Conta Contábil', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ showGridLines: false }],
    });
    sh2.columns = [
      { width: 4 }, { width: 14 }, { width: 38 }, { width: 20 }, { width: 4 },
    ];

    const renderChart = (title: string, data: Map<string, number>, total: number, accent: string) => {
      let r = sh2.lastRow ? sh2.lastRow.number + 2 : 2;
      sh2.mergeCells(r, 2, r, 4);
      const t = sh2.getCell(r, 2);
      t.value = title;
      t.font = { size: 13, bold: true, color: { argb: C_WHITE } };
      t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
      sh2.getRow(r).height = 22;
      r++;

      ['Código', 'Conta Contábil', 'Valor (R$)'].forEach((h, i) => {
        const c = sh2.getCell(r, 2 + i);
        c.value = h;
        c.font = { size: 10, bold: true };
        c.alignment = { horizontal: i === 2 ? 'right' : 'left', vertical: 'middle', indent: 1 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_GRAY_LIGHT } };
        c.border = { bottom: { style: 'thin', color: { argb: C_GRAY } } };
      });
      r++;

      const sorted = [...data.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      sorted.forEach(([key, val], idx) => {
        const [code, name] = key.split('||');
        const bg = idx % 2 === 1 ? 'FFFAFAFA' : C_WHITE;
        const cCode = sh2.getCell(r, 2); cCode.value = code; cCode.alignment = { vertical: 'middle', indent: 1 }; cCode.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        const cName = sh2.getCell(r, 3); cName.value = name; cName.alignment = { vertical: 'middle', indent: 1 }; cName.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        const cVal = sh2.getCell(r, 4); cVal.value = val; cVal.numFmt = '"R$" #,##0.00'; cVal.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }; cVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        sh2.getRow(r).height = 16;
        r++;
      });

      // Total
      sh2.mergeCells(r, 2, r, 3);
      const lbl = sh2.getCell(r, 2);
      lbl.value = 'TOTAL';
      lbl.font = { bold: true, color: { argb: C_WHITE } };
      lbl.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
      const vv = sh2.getCell(r, 4);
      vv.value = total; vv.numFmt = '"R$" #,##0.00';
      vv.font = { bold: true, color: { argb: C_WHITE } };
      vv.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      vv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
      sh2.getRow(r).height = 20;
    };

    // Header
    sh2.mergeCells(1, 2, 1, 4);
    const h = sh2.getCell(1, 2);
    h.value = `${headerName || 'Resumo Financeiro'} — Detalhe por Conta Contábil — ${monthName}/${year}`;
    h.font = { size: 14, bold: true, color: { argb: C_DARK } };
    h.alignment = { horizontal: 'center', vertical: 'middle' };
    sh2.getRow(1).height = 26;

    renderChart('▲  ENTRADAS POR CONTA CONTÁBIL', entriesByChart, totalEntries, C_GREEN);
    renderChart('▼  SAÍDAS POR CONTA CONTÁBIL', exitsByChart, totalExits, C_RED);

    // Signature block + print area
    const nextRow = addSignatureBlock(sh2, (sh2.lastRow?.number || 1) + 1, 2, 4);
    sh2.pageSetup.printArea = `A1:E${nextRow - 1}`;
    sh2.headerFooter.oddFooter = '&C&8Página &P de &N';
  }

  const buffer = await wb.xlsx.writeBuffer();
  const safe = (headerName || 'resumo').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const fileName = `${safe || 'resumo'}_${monthName.toLowerCase()}_${year}.xlsx`;
  triggerDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName
  );
}
