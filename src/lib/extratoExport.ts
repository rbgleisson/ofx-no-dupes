import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Transaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';

const thin: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
};

const fmtDate = (date: string) => {
  const [y, m, d] = (date || '').split('-');
  return d ? `${d}/${m}/${y}` : date;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function exportExtrato(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  chartAccounts: ChartAccount[],
  fileName = 'extrato.xlsx',
  options?: { title?: string; openingBalance?: number },
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Extrato', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const headers = ['Data', 'Descrição', 'Categoria', 'Conta', 'Código', 'Conta Contábil', 'Entrada', 'Saída', 'Saldo'];
  ws.columns = [
    { width: 12 }, { width: 46 }, { width: 24 }, { width: 20 },
    { width: 12 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 16 },
  ];

  // Title
  ws.mergeCells(1, 1, 1, headers.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = options?.title || 'Extrato de Lançamentos';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, headers.length);
  const subCell = ws.getCell(2, 1);
  subCell.value = `${transactions.length} lançamento(s) — gerado em ${new Date().toLocaleString('pt-BR')}`;
  subCell.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
  subCell.alignment = { horizontal: 'center' };

  ws.addRow([]);

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.height = 20;
  headerRow.eachCell(c => {
    c.border = thin;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E5F' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let running = round2(options?.openingBalance ?? 0);

  if (options?.openingBalance !== undefined) {
    const ob = ws.addRow(['', 'SALDO ANTERIOR', '', '', '', '', null, null, running]);
    ob.font = { bold: true, size: 10 };
    ob.eachCell(c => { c.border = thin; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; });
    ob.getCell(9).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  }

  let totalIn = 0;
  let totalOut = 0;

  transactions.forEach((tx, idx) => {
    const cat = categories.find(c => c.id === tx.category_id);
    const acc = accounts.find(a => a.id === tx.account_id);
    const ca = chartAccounts.find(c => c.id === (tx as any).chart_account_id);
    const amt = Number(tx.amount) || 0;
    const isIn = amt >= 0;
    if (isIn) totalIn += amt; else totalOut += Math.abs(amt);
    running = round2(running + amt);

    const row = ws.addRow([
      fmtDate(tx.date),
      tx.memo ? `${tx.description} — ${tx.memo}` : tx.description,
      cat ? (cat as any).code ? `${(cat as any).code} - ${cat.name}` : cat.name : '',
      acc?.name || '',
      ca?.code || '',
      ca?.name || '',
      isIn ? round2(amt) : null,
      isIn ? null : round2(Math.abs(amt)),
      running,
    ]);
    row.font = { size: 10 };
    row.eachCell(c => { c.border = thin; });
    if (idx % 2 === 1) {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FA' } }; });
    }
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(7).numFmt = 'R$ #,##0.00;;-';
    row.getCell(7).font = { size: 10, color: { argb: 'FF107C41' } };
    row.getCell(8).numFmt = 'R$ #,##0.00;;-';
    row.getCell(8).font = { size: 10, color: { argb: 'FFC00000' } };
    row.getCell(9).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    row.getCell(9).font = { size: 10, bold: true };
  });

  const totals = ws.addRow(['', 'TOTAIS', '', '', '', '', round2(totalIn), round2(totalOut), running]);
  totals.font = { bold: true, size: 11 };
  totals.height = 20;
  totals.eachCell(c => {
    c.border = thin;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEF1' } };
  });
  totals.getCell(7).numFmt = 'R$ #,##0.00';
  totals.getCell(8).numFmt = 'R$ #,##0.00';
  totals.getCell(9).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}
