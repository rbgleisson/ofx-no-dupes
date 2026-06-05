import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';

interface Transaction {
  date: string;
  amount: number;
  category_id: string | null;
  chart_account_id: string | null;
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

export async function exportMonthlySummary(
  categories: Category[],
  organizationId: string | null,
  year: number,
  month: number,
  chartAccounts: ChartAccount[] = []
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  let query = supabase
    .from('transactions')
    .select('date, amount, category_id, chart_account_id')
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data: transactions, error } = await query;
  if (error) throw error;

  const catMap = new Map(categories.map(c => [c.id, c.name]));
  const chartMap = new Map(chartAccounts.map(c => [c.id, c]));

  const entriesByCategory = new Map<string, number>();
  const exitsByCategory = new Map<string, number>();
  // key = `${code}||${name}`
  const entriesByChart = new Map<string, number>();
  const exitsByChart = new Map<string, number>();
  let totalEntries = 0;
  let totalExits = 0;

  for (const tx of (transactions || [])) {
    const catName = tx.category_id ? (catMap.get(tx.category_id) || 'Sem Categoria') : 'Sem Categoria';
    const ca = tx.chart_account_id ? chartMap.get(tx.chart_account_id) : null;
    const chartKey = ca ? `${ca.code}||${ca.name}` : `||Sem Conta Contábil`;

    if (tx.amount >= 0) {
      entriesByCategory.set(catName, (entriesByCategory.get(catName) || 0) + tx.amount);
      entriesByChart.set(chartKey, (entriesByChart.get(chartKey) || 0) + tx.amount);
      totalEntries += tx.amount;
    } else {
      const abs = Math.abs(tx.amount);
      exitsByCategory.set(catName, (exitsByCategory.get(catName) || 0) + abs);
      exitsByChart.set(chartKey, (exitsByChart.get(chartKey) || 0) + abs);
      totalExits += abs;
    }
  }

  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const monthName = MONTHS[month - 1];

  const wb = new ExcelJS.Workbook();
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };

  const buildCategorySheet = (
    name: string,
    headerColor: string,
    totalColor: string,
    totalLabel: string,
    data: Map<string, number>,
    total: number
  ) => {
    const sheet = wb.addWorksheet(name);
    sheet.columns = [
      { header: 'Categoria', key: 'cat', width: 35 },
      { header: 'Valor (R$)', key: 'val', width: 18 },
    ];
    const h = sheet.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
    h.eachCell(c => { c.border = thinBorder; c.alignment = { horizontal: 'center' }; });

    const sorted = [...data.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, val] of sorted) {
      const row = sheet.addRow({ cat, val });
      row.getCell(2).numFmt = '#,##0.00';
      row.eachCell(c => { c.border = thinBorder; });
    }
    const totalRow = sheet.addRow({ cat: totalLabel, val: total });
    totalRow.font = { bold: true };
    totalRow.getCell(2).numFmt = '#,##0.00';
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalColor } };
    totalRow.eachCell(c => { c.border = thinBorder; });
  };

  const buildChartSheet = (
    name: string,
    headerColor: string,
    totalColor: string,
    totalLabel: string,
    data: Map<string, number>,
    total: number
  ) => {
    const sheet = wb.addWorksheet(name);
    sheet.columns = [
      { header: 'Código', key: 'code', width: 15 },
      { header: 'Conta Contábil', key: 'cname', width: 40 },
      { header: 'Valor (R$)', key: 'val', width: 18 },
    ];
    const h = sheet.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
    h.eachCell(c => { c.border = thinBorder; c.alignment = { horizontal: 'center' }; });

    const sorted = [...data.entries()].sort((a, b) => {
      const [codeA] = a[0].split('||');
      const [codeB] = b[0].split('||');
      return codeA.localeCompare(codeB);
    });
    for (const [key, val] of sorted) {
      const [code, cname] = key.split('||');
      const row = sheet.addRow({ code, cname, val });
      row.getCell(3).numFmt = '#,##0.00';
      row.eachCell(c => { c.border = thinBorder; });
    }
    const totalRow = sheet.addRow({ code: '', cname: totalLabel, val: total });
    totalRow.font = { bold: true };
    totalRow.getCell(3).numFmt = '#,##0.00';
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: totalColor } };
    totalRow.eachCell(c => { c.border = thinBorder; });
  };

  buildCategorySheet('Entradas', 'FF16A34A', 'FFBBF7D0', 'TOTAL ENTRADAS', entriesByCategory, totalEntries);
  buildCategorySheet('Saídas', 'FFDC2626', 'FFFECACA', 'TOTAL SAÍDAS', exitsByCategory, totalExits);
  buildChartSheet('Entradas por Conta', 'FF16A34A', 'FFBBF7D0', 'TOTAL ENTRADAS', entriesByChart, totalEntries);
  buildChartSheet('Saídas por Conta', 'FFDC2626', 'FFFECACA', 'TOTAL SAÍDAS', exitsByChart, totalExits);

  // === RESUMO sheet ===
  const sheetSummary = wb.addWorksheet('Resumo');
  sheetSummary.columns = [
    { header: 'Descrição', key: 'desc', width: 35 },
    { header: 'Valor (R$)', key: 'val', width: 18 },
  ];

  const hSum = sheetSummary.getRow(1);
  hSum.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hSum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  hSum.eachCell(c => { c.border = thinBorder; c.alignment = { horizontal: 'center' }; });

  const r1 = sheetSummary.addRow({ desc: 'Total Entradas', val: totalEntries });
  r1.getCell(2).numFmt = '#,##0.00';
  r1.getCell(2).font = { color: { argb: 'FF16A34A' }, bold: true };
  r1.eachCell(c => { c.border = thinBorder; });

  const r2 = sheetSummary.addRow({ desc: 'Total Saídas', val: totalExits });
  r2.getCell(2).numFmt = '#,##0.00';
  r2.getCell(2).font = { color: { argb: 'FFDC2626' }, bold: true };
  r2.eachCell(c => { c.border = thinBorder; });

  const saldo = totalEntries - totalExits;
  const r3 = sheetSummary.addRow({ desc: 'Saldo', val: saldo });
  r3.getCell(2).numFmt = '#,##0.00';
  r3.font = { bold: true, size: 13 };
  r3.getCell(2).font = { bold: true, size: 13, color: { argb: saldo >= 0 ? 'FF16A34A' : 'FFDC2626' } };
  r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  r3.eachCell(c => { c.border = thinBorder; });

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `resumo_mensal_${monthName.toLowerCase()}_${year}.xlsx`;
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}
