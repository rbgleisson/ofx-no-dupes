import { useEffect, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { fetchMonthComposition, type CashflowRow, type MonthComposition } from '@/lib/monthComposition';
import { fetchMonthClosure, type MonthClosure } from '@/lib/monthClosure';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : 'data não registrada');
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

interface Props { organizationId: string | null; year?: number; month?: number; refreshKey?: unknown }

export function originText(c: MonthComposition): string {
  const o = c.origin;
  if (o.kind === 'manual') return `Salvo manualmente por ${o.userLabel || 'usuário não identificado'} em ${fmtDate(o.savedAt)}.`;
  if (o.kind === 'chained') return `Encadeado a partir do valor salvo manualmente em ${String(o.month).padStart(2, '0')}/${o.year} por ${o.userLabel || 'usuário não identificado'} em ${fmtDate(o.savedAt)}, somando os meses seguintes.`;
  return 'Calculado a partir dos saldos das contas no fim do mês anterior.';
}

function ExcludedList({ items }: { items: CashflowRow[] }) {
  return (
    <ul className="mt-2 max-h-48 overflow-y-auto space-y-1 text-xs border-l pl-3">
      {items.map((t, i) => (
        <li key={t.id ?? i} className="flex justify-between gap-3">
          <span className="truncate">{fmtDay(t.date)} · {t.description || '—'}</span>
          <span className="tabular-nums shrink-0">{fmt(Number(t.amount))}</span>
        </li>
      ))}
    </ul>
  );
}

export function MonthCompositionDetails({ organizationId, year, month, refreshKey }: Props) {
  const [data, setData] = useState<MonthComposition | null>(null);
  const [closure, setClosure] = useState<MonthClosure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [show, setShow] = useState<null | 'transfers' | 'noAccount'>(null);

  useEffect(() => {
    if (!organizationId || !year || !month) return;
    let cancelled = false;
    setLoading(true); setError(false);
    Promise.all([fetchMonthComposition(organizationId, year, month), fetchMonthClosure(organizationId, year, month)])
      .then(([c, cl]) => { if (!cancelled) { setData(c); setClosure(cl as MonthClosure | null); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [organizationId, year, month, refreshKey]);

  if (!organizationId || !year || !month) return <p className="text-sm text-muted-foreground">Escolha um mês para ver a composição.</p>;
  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (error || !data) return <p className="text-sm text-destructive">Não foi possível carregar a composição do mês.</p>;
  const { cashflow: cf } = data;
  const savedBalance = closure?.closed_month_balance;
  const savedTotal = closure?.closed_total_with_investments;
  const diffBalance = savedBalance != null ? Math.round((data.monthBalance - Number(savedBalance)) * 100) / 100 : 0;
  const diffTotal = savedTotal != null ? Math.round((data.totalWithInvestments - Number(savedTotal)) * 100) / 100 : 0;

  return (
    <div className="space-y-3 text-sm" aria-label="Composição do saldo do mês">
      <div>
        <div className="flex justify-between gap-3"><span>Saldo Anterior</span><span className="font-semibold tabular-nums">{fmt(data.previousBalance)}</span></div>
        <p className="text-xs text-muted-foreground">{originText(data)}</p>
      </div>
      <div className="flex justify-between gap-3"><span>(+) Entradas <span className="text-xs text-muted-foreground">({cf.entriesCount} lançamentos)</span></span><span className="tabular-nums">{fmt(cf.entries)}</span></div>
      <div className="flex justify-between gap-3"><span>(−) Saídas <span className="text-xs text-muted-foreground">({cf.exitsCount} lançamentos)</span></span><span className="tabular-nums">{fmt(cf.exits)}</span></div>
      <div className="flex justify-between gap-3 border-t pt-2 font-semibold"><span>(=) Saldo do mês</span><span className="tabular-nums">{fmt(data.monthBalance)}</span></div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground"><span>Total com aplicações (Saldo do mês + {fmt(data.totalApplied)} aplicados)</span><span className="tabular-nums">{fmt(data.totalWithInvestments)}</span></div>

      <div className="rounded-md border p-3 space-y-2">
        <p className="text-xs font-medium">Ficou de fora do cálculo</p>
        {([['transfers', 'Transferências internas', cf.transfers], ['noAccount', 'Lançamentos sem conta', cf.noAccount]] as const).map(([key, label, g]) => (
          <div key={key}>
            <div className="flex justify-between gap-3 text-xs">
              <span>{label}: {g.count} · {fmt(g.sum)}</span>
              {g.count > 0 && <button type="button" className="underline text-primary" onClick={() => setShow(show === key ? null : key)}>{show === key ? 'Ocultar' : 'Ver lançamentos'}</button>}
            </div>
            {show === key && <ExcludedList items={g.items} />}
          </div>
        ))}
      </div>

      {closure && savedBalance != null && (
        <div className="rounded-md border p-3 text-xs space-y-1">
          <p>Gravado no fechamento: Saldo do mês {fmt(Number(savedBalance))} · Total com aplicações {fmt(Number(savedTotal ?? 0))}</p>
          {(diffBalance !== 0 || diffTotal !== 0) && (
            <p className="text-destructive font-medium">Atenção: o cálculo atual difere do valor gravado ({diffBalance !== 0 ? `Saldo do mês ${fmt(diffBalance)}` : ''}{diffBalance !== 0 && diffTotal !== 0 ? '; ' : ''}{diffTotal !== 0 ? `Total com aplicações ${fmt(diffTotal)}` : ''}).</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MonthCompositionButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs"><Calculator className="w-3 h-3 mr-1" />Como foi calculado?</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Como foi calculado o Saldo do mês</DialogTitle></DialogHeader>
        {open && <MonthCompositionDetails {...props} />}
      </DialogContent>
    </Dialog>
  );
}
