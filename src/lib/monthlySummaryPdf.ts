import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MonthReconciliation } from '@/lib/monthReconciliation';

interface Row { name: string; value: number }
interface ChartRow { code: string; name: string; value: number }
export interface MonthlySummaryPdfInput {
  title: string; monthName: string; year: number; closing: MonthReconciliation;
  investments: Row[]; entries: Row[]; exits: Row[]; chartEntries: ChartRow[]; chartExits: ChartRow[]; countTx: number;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SIGNERS = ['Pastor Presidente', 'Tesoureiro', 'Comissão de Contas'];

export function buildMonthlySummaryPdf(d: MonthlySummaryPdfInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const lastY = () => (doc as any).lastAutoTable.finalY as number;
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text(d.title, W / 2, 16, { align: 'center' });
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(`Resumo Mensal — ${d.monthName}/${d.year}`, W / 2, 23, { align: 'center' });

  const c = d.closing;
  const body: (string | number)[][] = [
    ['Saldo Anterior', fmt(c.previousBalance)],
    ['(+) Entradas', fmt(c.entries)],
    ['(−) Saídas', fmt(c.exits)],
    ['(=) Resultado do mês (Entradas − Saídas)', fmt(c.monthResult)],
    ['Saldo do mês (Saldo Anterior + Resultado)', fmt(c.monthBalance)],
    ['(+/−) Aplicações, resgates e transferências (líquido)', fmt(c.internalNet)],
    ...(c.otherDifferences !== 0 ? [['(+/−) Outras diferenças (saldo anterior, aplicações, extrato)', fmt(c.otherDifferences)]] : []),
    ['(=) Saldo disponível nos bancos no fim do mês', fmt(c.bankFinal)],
    ...d.investments.map(i => [`(+) Saldo de Aplicação ${i.name}`, fmt(i.value)]),
    ['(=) Total com aplicações', fmt(c.totalWithInvestments)],
  ];
  autoTable(doc, {
    startY: 30, body, theme: 'grid', styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
    didParseCell: h => { if (String(h.row.raw?.[0] ?? '').startsWith('(=)')) h.cell.styles.fontStyle = 'bold'; },
  });
  const cat = (title: string, rows: Row[], total: number, color: [number, number, number]) => autoTable(doc, {
    startY: lastY() + 6, head: [[title, 'Valor']], body: rows.map(r => [r.name, fmt(r.value)]),
    foot: [['TOTAL', fmt(total)]], theme: 'striped', styles: { fontSize: 9 },
    headStyles: { fillColor: color }, footStyles: { fillColor: color },
    columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
  });
  cat('Entradas por Categoria', d.entries, c.entries, [22, 163, 74]);
  cat('Saídas por Categoria', d.exits, c.exits, [220, 38, 38]);

  if (d.chartEntries.length || d.chartExits.length) {
    doc.addPage();
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`Detalhe por Conta Contábil — ${d.monthName}/${d.year}`, W / 2, 16, { align: 'center' });
    const chart = (title: string, rows: ChartRow[], total: number, color: [number, number, number], startY: number) => autoTable(doc, {
      startY, head: [['Código', title, 'Valor']], body: rows.map(r => [r.code, r.name, fmt(r.value)]),
      foot: [['', 'TOTAL', fmt(total)]], theme: 'striped', styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: color }, footStyles: { fillColor: color },
      columnStyles: { 0: { cellWidth: 22 }, 2: { halign: 'right', cellWidth: 38 } }, margin: { bottom: 40 },
    });
    chart('Entradas por Conta Contábil', d.chartEntries, c.entries, [22, 163, 74], 22);
    chart('Saídas por Conta Contábil', d.chartExits, c.exits, [220, 38, 38], lastY() + 5);
  }

  // Assinaturas lado a lado no rodapé da última página
  if (lastY() > H - 40) doc.addPage();
  const y = H - 24; const margin = 14; const gap = 8;
  const w = (W - margin * 2 - gap * 2) / 3;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setDrawColor(15, 23, 42);
  SIGNERS.forEach((s, i) => {
    const x = margin + i * (w + gap);
    doc.line(x, y, x + w, y);
    doc.text(s, x + w / 2, y + 5, { align: 'center' });
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setFont('helvetica', 'italic');
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} • ${d.countTx} lançamentos • Página ${p} de ${pages}`, W / 2, H - 8, { align: 'center' });
  }
  return doc.output('blob');
}
