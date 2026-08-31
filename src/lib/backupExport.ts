import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';

interface BackupTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  memo?: string | null;
  fit_id?: string | null;
  type?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  chart_account_id?: string | null;
  attachment_url?: string | null;
  is_transfer?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Category { id: string; name: string; color: string; }
interface Account { id: string; name: string; color: string; }
interface ChartAccount { id: string; code: string; name: string; }

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

export async function createFullBackup(
  onProgress?: (msg: string) => void,
): Promise<void> {
  const zip = new JSZip();
  const report = onProgress || (() => {});

  report('Carregando dados...');

  // Todo o backup fica preso à organização do usuário logado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!orgId) throw new Error('Organização do usuário não encontrada.');

  // Fetch all data
  const [txRes, catRes, accRes, caRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('organization_id', orgId as string).order('date', { ascending: false }),
    supabase.from('categories').select('*').eq('organization_id', orgId as string).order('name'),
    supabase.from('accounts').select('*').eq('organization_id', orgId as string).order('name'),
    supabase.from('chart_accounts').select('*').eq('organization_id', orgId as string).order('code'),
  ]);


  const transactions: BackupTransaction[] = txRes.data || [];
  const categories: Category[] = catRes.data as Category[] || [];
  const accounts: Account[] = accRes.data as Account[] || [];
  const chartAccounts: ChartAccount[] = caRes.data as ChartAccount[] || [];

  // Build Excel workbook
  report('Gerando planilha...');
  const wb = new ExcelJS.Workbook();

  // Transactions sheet
  const wsTx = wb.addWorksheet('Transações');
  const txCols = ['Data', 'Descrição', 'Memo', 'Valor', 'Categoria', 'Conta', 'Conta Contábil', 'Transferência', 'Anexo'];
  wsTx.columns = [
    { width: 14 }, { width: 42 }, { width: 32 }, { width: 16 },
    { width: 22 }, { width: 22 }, { width: 32 }, { width: 14 }, { width: 40 },
  ];
  const hRow = wsTx.addRow(txCols);
  hRow.font = { bold: true, size: 10 };
  hRow.eachCell(c => {
    c.border = thinBorder;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  for (const tx of transactions) {
    const cat = categories.find(c => c.id === tx.category_id);
    const acc = accounts.find(a => a.id === tx.account_id);
    const ca = chartAccounts.find(c => c.id === tx.chart_account_id);
    const attachFile = tx.attachment_url ? `anexos/${tx.id}_${tx.attachment_url.split('/').pop()}` : '';

    const r = wsTx.addRow([
      formatDate(tx.date),
      tx.description,
      tx.memo || '',
      Number(tx.amount),
      cat?.name || '',
      acc?.name || '',
      ca ? `${ca.code} - ${ca.name}` : '',
      tx.is_transfer ? 'Sim' : 'Não',
      attachFile,
    ]);
    r.font = { size: 10 };
    r.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      if (colNumber === 4) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      }
    });
  }

  // Categories sheet
  const wsCat = wb.addWorksheet('Categorias');
  wsCat.columns = [{ width: 30 }, { width: 14 }];
  const catHeader = wsCat.addRow(['Nome', 'Cor']);
  catHeader.font = { bold: true };
  catHeader.eachCell(c => { c.border = thinBorder; });
  for (const cat of categories) {
    wsCat.addRow([cat.name, cat.color]);
  }

  // Accounts sheet
  const wsAcc = wb.addWorksheet('Contas');
  wsAcc.columns = [{ width: 30 }, { width: 14 }];
  const accHeader = wsAcc.addRow(['Nome', 'Cor']);
  accHeader.font = { bold: true };
  accHeader.eachCell(c => { c.border = thinBorder; });
  for (const acc of accounts) {
    wsAcc.addRow([acc.name, acc.color]);
  }

  // Chart accounts sheet
  const wsCa = wb.addWorksheet('Plano de Contas');
  wsCa.columns = [{ width: 14 }, { width: 40 }];
  const caHeader = wsCa.addRow(['Código', 'Nome']);
  caHeader.font = { bold: true };
  caHeader.eachCell(c => { c.border = thinBorder; });
  for (const ca of chartAccounts) {
    wsCa.addRow([ca.code, ca.name]);
  }

  const xlsxBuffer = await wb.xlsx.writeBuffer();
  zip.file('dados.xlsx', xlsxBuffer);

  // Download attachments
  const withAttachments = transactions.filter(t => t.attachment_url);
  if (withAttachments.length > 0) {
    report(`Baixando ${withAttachments.length} anexo(s)...`);
    const anexosFolder = zip.folder('anexos');

    let downloaded = 0;
    for (const tx of withAttachments) {
      try {
        const url = tx.attachment_url!;
        const fileName = `${tx.id}_${url.split('/').pop() || 'arquivo'}`;
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          anexosFolder!.file(fileName, blob);
          downloaded++;
          report(`Baixando anexos... ${downloaded}/${withAttachments.length}`);
        }
      } catch {
        // Skip failed downloads
      }
    }
  }

  report('Gerando arquivo ZIP...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  saveAs(zipBlob, `backup_financeiro_${dateStr}.zip`);

  report('Backup concluído!');
}
