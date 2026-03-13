import ExcelJS from 'exceljs';

export interface ExcelRow {
  date: string;
  amount: number;
  description: string;
  memo?: string;
  category_id?: string | null;
  account_id?: string | null;
  chart_account_id?: string | null;
  _fit_id?: string;
  _type?: string;
  _is_transfer?: boolean;
}

export async function downloadExcelTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Modelo');

  ws.columns = [
    { header: 'Data', key: 'date', width: 15 },
    { header: 'Valor', key: 'amount', width: 15 },
    { header: 'Descrição', key: 'description', width: 40 },
    { header: 'Memo', key: 'memo', width: 30 },
  ];

  // Style header
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { horizontal: 'center' };
  });

  // Add example rows
  ws.addRow({ date: '01/01/2025', amount: -150.00, description: 'Pagamento fornecedor', memo: 'NF 1234' });
  ws.addRow({ date: '02/01/2025', amount: 500.00, description: 'Recebimento cliente', memo: '' });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo_importacao.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

function parseDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  // dd/mm/yyyy
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  return null;
}

export async function parseExcelFile(file: File): Promise<ExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Planilha vazia');

  const rows: ExcelRow[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const dateVal = row.getCell(1).value;
    const amountVal = row.getCell(2).value;
    const descVal = row.getCell(3).value;
    const memoVal = row.getCell(4).value;

    const date = parseDate(dateVal);
    const amount = typeof amountVal === 'number' ? amountVal : parseFloat(String(amountVal || '').replace(',', '.'));
    const description = String(descVal || '').trim();

    if (!date || isNaN(amount) || !description) return;

    rows.push({
      date,
      amount,
      description,
      memo: memoVal ? String(memoVal).trim() : undefined,
      category_id: null,
      account_id: null,
      chart_account_id: null,
    });
  });

  return rows;
}
