import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';

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

export async function exportCategoriesAndChartAccounts(
  categories: Category[],
  chartAccounts: ChartAccount[],
  fileName = 'categorias_contas_contabeis.xlsx'
) {
  const wb = new ExcelJS.Workbook();

  // Categories sheet
  const cSheet = wb.addWorksheet('Categorias');
  cSheet.columns = [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Cor', key: 'color', width: 12 },
  ];
  const cHeader = cSheet.getRow(1);
  cHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
  categories.forEach(c => cSheet.addRow({ name: c.name, color: c.color }));

  // Chart accounts sheet
  const caSheet = wb.addWorksheet('Contas Contábeis');
  caSheet.columns = [
    { header: 'Código', key: 'code', width: 15 },
    { header: 'Nome', key: 'name', width: 40 },
  ];
  const caHeader = caSheet.getRow(1);
  caHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  caHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
  chartAccounts.forEach(ca => caSheet.addRow({ code: ca.code, name: ca.name }));

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

export async function importCategoriesAndChartAccounts(
  file: File
): Promise<{ categories: number; chartAccounts: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });

  const ab = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(ab);

  let catCount = 0;
  let caCount = 0;

  // Import categories
  const cSheet = wb.getWorksheet('Categorias');
  if (cSheet) {
    const rows: { name: string; color: string; user_id: string; organization_id: string | null }[] = [];
    cSheet.eachRow((row, i) => {
      if (i === 1) return;
      const name = String(row.getCell(1).value || '').trim();
      const color = String(row.getCell(2).value || '#6366f1').trim();
      if (name) rows.push({ name, color, user_id: user.id, organization_id: orgId });
    });
    if (rows.length > 0) {
      const { error } = await supabase.from('categories').insert(rows);
      if (error) throw error;
      catCount = rows.length;
    }
  }

  // Import chart accounts
  const caSheet = wb.getWorksheet('Contas Contábeis');
  if (caSheet) {
    const rows: { code: string; name: string; user_id: string; organization_id: string | null }[] = [];
    caSheet.eachRow((row, i) => {
      if (i === 1) return;
      const code = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      if (code && name) rows.push({ code, name, user_id: user.id, organization_id: orgId });
    });
    if (rows.length > 0) {
      const { error } = await supabase.from('chart_accounts').insert(rows);
      if (error) throw error;
      caCount = rows.length;
    }
  }

  return { categories: catCount, chartAccounts: caCount };
}
