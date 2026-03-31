import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';

interface Transaction {
  date: string;
  amount: number;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
  color: string;
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
  month: number
) {
  // Fetch all transactions for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  let query = supabase
    .from('transactions')
    .select('date, amount, category_id')
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date');

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data: transactions, error } = await query;
  if (error) throw error;

  const catMap = new Map(categories.map(c => [c.id, c.name]));

  // Group by category
  const entriesByCategory = new Map<string, number>();
  const exitsByCategory = new Map<string, number>();
  let totalEntries = 0;
  let totalExits = 0;

  for (const tx of (transactions || [])) {
    const catName = tx.category_id ? (catMap.get(tx.category_id) || 'Sem Categoria') : 'Sem Categoria';
    if (tx.amount >= 0) {
      entriesByCategory.set(catName, (entriesByCategory.get(catName) || 0) + tx.amount);
      totalEntries += tx.amount;
    } else {
      exitsByCategory.set(catName, (exitsByCategory.get(catName) || 0) + Math.abs(tx.amount));
      totalExits += Math.abs(tx.amount);
    }
  }

  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const monthName = MONTHS[month - 1];

  const wb = new ExcelJS.Workbook();
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  };

  // === ENTRADAS sheet ===
  const sheetIn = wb.addWorksheet('Entradas');
  sheetIn.columns = [
    { header: 'Categoria', key: 'cat', width: 35 },
    { header: 'Valor (R$)', key: 'val', width: 18 },
  ];

  const hIn = sheetIn.getRow(1);
  hIn.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hIn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
  hIn.eachCell(c => { c.border = thinBorder; c.alignment = { horizontal: 'center' }; });

  const sortedEntries = [...entriesByCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, val] of sortedEntries) {
    const row = sheetIn.addRow({ cat, val });
    row.getCell(2).numFmt = '#,##0.00';
    row.eachCell(c => { c.border = thinBorder; });
  }

  const totalRowIn = sheetIn.addRow({ cat: 'TOTAL ENTRADAS', val: totalEntries });
  totalRowIn.font = { bold: true };
  totalRowIn.getCell(2).numFmt = '#,##0.00';
  totalRowIn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } };
  totalRowIn.eachCell(c => { c.border = thinBorder; });

  // === SAÍDAS sheet ===
  const sheetOut = wb.addWorksheet('Saídas');
  sheetOut.columns = [
    { header: 'Categoria', key: 'cat', width: 35 },
    { header: 'Valor (R$)', key: 'val', width: 18 },
  ];

  const hOut = sheetOut.getRow(1);
  hOut.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hOut.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  hOut.eachCell(c => { c.border = thinBorder; c.alignment = { horizontal: 'center' }; });

  const sortedExits = [...exitsByCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, val] of sortedExits) {
    const row = sheetOut.addRow({ cat, val });
    row.getCell(2).numFmt = '#,##0.00';
    row.eachCell(c => { c.border = thinBorder; });
  }

  const totalRowOut = sheetOut.addRow({ cat: 'TOTAL SAÍDAS', val: totalExits });
  totalRowOut.font = { bold: true };
  totalRowOut.getCell(2).numFmt = '#,##0.00';
  totalRowOut.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
  totalRowOut.eachCell(c => { c.border = thinBorder; });

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
