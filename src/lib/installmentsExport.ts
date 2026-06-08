import ExcelJS from 'exceljs';
import { Installment } from './installmentStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';

const fmtDate = (d: string) => {
  const parts = d.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

function buildSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: Installment[],
  categories: Category[],
  accounts: Account[],
) {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: 'Descrição', key: 'description', width: 35 },
    { header: 'NF', key: 'invoice_number', width: 14 },
    { header: 'Parcela', key: 'parcela', width: 10 },
    { header: 'Vencimento', key: 'due_date', width: 14 },
    { header: 'Valor', key: 'amount', width: 14 },
    { header: 'Categoria', key: 'category', width: 22 },
    { header: 'Conta', key: 'account', width: 22 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Pago em', key: 'paid_at', width: 14 },
    { header: 'Observações', key: 'notes', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  let total = 0;
  rows.forEach((i) => {
    const cat = categories.find((c) => c.id === i.category_id);
    const acc = accounts.find((a) => a.id === i.account_id);
    total += Number(i.amount);
    ws.addRow({
      description: i.description,
      invoice_number: i.invoice_number || '',
      parcela: `${i.installment_number}/${i.total_installments}`,
      due_date: fmtDate(i.due_date),
      amount: Number(i.amount),
      category: cat?.name || '',
      account: acc?.name || '',
      status: i.is_paid ? 'Pago' : 'Em aberto',
      paid_at: i.paid_at ? fmtDate(i.paid_at.split('T')[0]) : '',
      notes: i.notes || '',
    });
  });

  ws.getColumn('amount').numFmt = 'R$ #,##0.00';

  const totalRow = ws.addRow({ description: 'TOTAL', amount: total });
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });
  });
}

export async function exportInstallments(
  installments: Installment[],
  categories: Category[],
  accounts: Account[],
) {
  const wb = new ExcelJS.Workbook();
  const payable = installments
    .filter((i) => i.type === 'payable')
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const receivable = installments
    .filter((i) => i.type === 'receivable')
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  buildSheet(wb, 'Contas a Pagar', payable, categories, accounts);
  buildSheet(wb, 'Contas a Receber', receivable, categories, accounts);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().split('T')[0];
  a.download = `contas_${today}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
