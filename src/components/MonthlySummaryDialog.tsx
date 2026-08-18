import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownCircle, ArrowUpCircle, BarChart3, Download, Loader2, TrendingUp, Wallet, Building2 } from 'lucide-react';
import { Category } from '@/components/CategoriesManager';
import { exportMonthlySummary } from '@/lib/monthlySummaryExport';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

interface ChartAccount { id: string; code: string; name: string; }

interface Props {
  categories: Category[];
  chartAccounts?: ChartAccount[];
  organizationId: string | null;
  orgName?: string | null;
  onSuccess?: () => void;
  onError?: () => void;
  trigger?: React.ReactNode;
}

interface Tx {
  date: string;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  is_transfer?: boolean | null;
}

interface Acct {
  id: string;
  name: string;
  color: string;
  opening_balance: number | null;
  opening_balance_date: string | null;
}

interface Inst {
  type: string;
  amount: number;
  due_date: string;
  is_paid: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Fetch every row of a query, bypassing the 1000-row default limit. */
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await build().range(from, from + step - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}

const MonthlySummaryDialog = ({ categories, chartAccounts = [], organizationId, orgName, onSuccess, onError, trigger }: Props) => {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [headerName, setHeaderName] = useState<string>(orgName || '');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [priorTxs, setPriorTxs] = useState<Tx[]>([]);
  const [insts, setInsts] = useState<Inst[]>([]);
  const [previousBalance, setPreviousBalance] = useState<number>(0);
  const [prevBalanceInput, setPrevBalanceInput] = useState<string>('0,00');
  const [prevBalanceEdited, setPrevBalanceEdited] = useState(false);

  useEffect(() => {
    if (orgName && !headerName) setHeaderName(orgName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgName]);

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const y = Number(year);
        const m = Number(month);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

        const scoped = (q: any) => (organizationId ? q.eq('organization_id', organizationId) : q);

        const [monthTx, prevTx, accts, instRows] = await Promise.all([
          fetchAll<Tx>(() => scoped(
            supabase.from('transactions')
              .select('date, amount, category_id, account_id, is_transfer')
              .gte('date', startDate).lt('date', endDate).order('date')
          )),
          fetchAll<Tx>(() => scoped(
            supabase.from('transactions')
              .select('date, amount, category_id, account_id, is_transfer')
              .lt('date', startDate).order('date')
          )),
          fetchAll<Acct>(() => scoped(
            supabase.from('accounts')
              .select('id, name, color, opening_balance, opening_balance_date').order('name')
          )),
          fetchAll<Inst>(() => scoped(
            supabase.from('installments')
              .select('type, amount, due_date, is_paid')
              .gte('due_date', startDate).lt('due_date', endDate)
          )),
        ]);

        if (cancelled) return;
        setTxs(monthTx);
        setPriorTxs(prevTx);
        setAccounts(accts);
        setInsts(instRows);

        // Saldo anterior real = saldos iniciais das contas + movimento anterior das contas reais
        const ids = new Set(accts.map(a => a.id));
        const openingByAcct = new Map(accts.map(a => [a.id, a.opening_balance_date]));
        let prev = accts.reduce((s, a) => {
          const d = a.opening_balance_date;
          if (d && String(d).slice(0, 10) >= startDate) return s;
          return s + Number(a.opening_balance || 0);
        }, 0);
        for (const t of prevTx) {
          if (!t.account_id || !ids.has(t.account_id)) continue;
          const since = openingByAcct.get(t.account_id);
          if (since && String(t.date).slice(0, 10) < String(since).slice(0, 10)) continue;
          prev += Number(t.amount) || 0;
        }
        prev = Math.round(prev * 100) / 100;
        setPreviousBalance(prev);
        if (!prevBalanceEdited) {
          setPrevBalanceInput(prev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year, month, organizationId]);

  // Reset edit flag when month/year changes
  useEffect(() => {
    setPrevBalanceEdited(false);
  }, [year, month]);

  const parsedPrevBalance = useMemo(() => {
    const cleaned = prevBalanceInput.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }, [prevBalanceInput]);

  const stats = useMemo(() => {
    const entriesByCat = new Map<string, number>();
    const exitsByCat = new Map<string, number>();
    let totalEntries = 0;
    let totalExits = 0;
    let transferVolume = 0;
    let count = 0;
    for (const tx of txs) {
      if (tx.is_transfer) { transferVolume += Math.abs(Number(tx.amount) || 0); continue; }
      count++;
      const catKey = tx.category_id || '__none__';
      if (tx.amount >= 0) {
        entriesByCat.set(catKey, (entriesByCat.get(catKey) || 0) + tx.amount);
        totalEntries += tx.amount;
      } else {
        const abs = Math.abs(tx.amount);
        exitsByCat.set(catKey, (exitsByCat.get(catKey) || 0) + abs);
        totalExits += abs;
      }
    }
    const toList = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([id, val]) => {
          const cat = catMap.get(id);
          return {
            id,
            name: cat?.name || 'Sem Categoria',
            color: cat?.color || '#64748b',
            value: val,
          };
        })
        .sort((a, b) => b.value - a.value);
    return {
      totalEntries,
      totalExits,
      saldo: totalEntries - totalExits,
      entries: toList(entriesByCat),
      exits: toList(exitsByCat),
      count,
      transferVolume,
      uncategorized: txs.filter(t => !t.is_transfer && !t.category_id).length,
    };
  }, [txs, catMap]);

  /** Saldo bancário por conta no fim do mês (inclui transferências, igual ao extrato). */
  const accountBalances = useMemo(() => {
    const all = [...priorTxs, ...txs];
    return accounts.map(a => {
      const since = a.opening_balance_date ? String(a.opening_balance_date).slice(0, 10) : null;
      let bal = Number(a.opening_balance || 0);
      let movimento = 0;
      for (const t of all) {
        if (t.account_id !== a.id) continue;
        const d = String(t.date).slice(0, 10);
        if (since && d < since) continue;
        bal += Number(t.amount) || 0;
      }
      for (const t of txs) {
        if (t.account_id !== a.id) continue;
        movimento += Number(t.amount) || 0;
      }
      return {
        id: a.id,
        name: a.name,
        color: a.color,
        balance: Math.round(bal * 100) / 100,
        movimento: Math.round(movimento * 100) / 100,
      };
    });
  }, [accounts, priorTxs, txs]);

  const totalBankBalance = useMemo(
    () => Math.round(accountBalances.reduce((s, a) => s + a.balance, 0) * 100) / 100,
    [accountBalances]
  );

  /** Movimento bancário completo do mês (inclui aplicações/resgates/transferências). */
  const bankMovement = useMemo(
    () => Math.round(accountBalances.reduce((s, a) => s + a.movimento, 0) * 100) / 100,
    [accountBalances]
  );

  const instSummary = useMemo(() => {
    let toReceive = 0, toPay = 0, receivedPaid = 0, paidOut = 0;
    for (const i of insts) {
      const v = Number(i.amount) || 0;
      if (i.type === 'receivable') { if (i.is_paid) receivedPaid += v; else toReceive += v; }
      else { if (i.is_paid) paidOut += v; else toPay += v; }
    }
    return { toReceive, toPay, receivedPaid, paidOut, pending: insts.filter(i => !i.is_paid).length };
  }, [insts]);


  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMonthlySummary(
        categories,
        organizationId,
        Number(year),
        Number(month),
        chartAccounts,
        (headerName || orgName || '').trim(),
        parsedPrevBalance,
        bankMovement,
      );
      onSuccess?.();
    } catch {
      onError?.();
    } finally {
      setExporting(false);
    }
  };

  const finalBalance = parsedPrevBalance + stats.saldo;

  const monthName = MONTHS[Number(month) - 1];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <BarChart3 className="w-4 h-4 mr-2 text-blue-600" />
            Resumo Mensal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950 border border-cyan-500/20 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-400/30">
              <BarChart3 className="w-5 h-5 text-cyan-300" />
            </div>
            <span className="bg-gradient-to-r from-cyan-200 to-blue-300 bg-clip-text text-transparent">
              Resumo Mensal — {monthName} / {year}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="space-y-3 pt-2">
          <div>
            <p className="text-[10px] font-medium text-cyan-300/70 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Nome no Cabeçalho (Excel)
            </p>
            <Input
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
              placeholder="Nome da empresa / igreja"
              className="h-9 text-sm bg-slate-900/80 border-cyan-500/20 text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[120px]">
              <p className="text-[10px] font-medium text-cyan-300/70 uppercase tracking-wider mb-1">Ano</p>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="h-9 text-sm bg-slate-900/80 border-cyan-500/20"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <p className="text-[10px] font-medium text-cyan-300/70 uppercase tracking-wider mb-1">Mês</p>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-9 text-sm bg-slate-900/80 border-cyan-500/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleExport}
              disabled={exporting || loading}
              className="h-9 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white border-0 shadow-lg shadow-cyan-500/20"
            >
              {exporting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
              Exportar Excel
            </Button>
          </div>

          <div>
            <p className="text-[10px] font-medium text-cyan-300/70 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Wallet className="w-3 h-3" /> Saldo Anterior (editável)
              {!prevBalanceEdited && (
                <span className="text-[9px] text-slate-500 normal-case tracking-normal">
                  — calculado automaticamente
                </span>
              )}
            </p>
            <Input
              value={prevBalanceInput}
              onChange={(e) => { setPrevBalanceInput(e.target.value); setPrevBalanceEdited(true); }}
              onBlur={() => {
                setPrevBalanceInput(parsedPrevBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
              }}
              placeholder="0,00"
              className="h-9 text-sm bg-slate-900/80 border-cyan-500/20 text-slate-100 tabular-nums"
            />
            {prevBalanceEdited && Math.abs(parsedPrevBalance - previousBalance) > 0.001 && (
              <button
                type="button"
                onClick={() => {
                  setPrevBalanceInput(previousBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                  setPrevBalanceEdited(false);
                }}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 mt-1"
              >
                ↺ Restaurar valor calculado ({fmt(previousBalance)})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard
                icon={<ArrowUpCircle className="w-5 h-5" />}
                label="Entradas"
                value={fmt(stats.totalEntries)}
                accent="from-emerald-500/20 to-emerald-500/5 border-emerald-400/30 text-emerald-300"
              />
              <StatCard
                icon={<ArrowDownCircle className="w-5 h-5" />}
                label="Saídas"
                value={fmt(stats.totalExits)}
                accent="from-rose-500/20 to-rose-500/5 border-rose-400/30 text-rose-300"
              />
              <StatCard
                icon={<Wallet className="w-5 h-5" />}
                label="Saldo do Mês"
                value={fmt(stats.saldo)}
                accent={cn(
                  stats.saldo >= 0
                    ? 'from-cyan-500/20 to-blue-500/5 border-cyan-400/30 text-cyan-200'
                    : 'from-amber-500/20 to-orange-500/5 border-amber-400/30 text-amber-300'
                )}
                highlight
              />
            </div>

            {/* Categories breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CategoryList
                title="Entradas por Categoria"
                items={stats.entries}
                total={stats.totalEntries}
                accentColor="emerald"
              />
              <CategoryList
                title="Saídas por Categoria"
                items={stats.exits}
                total={stats.totalExits}
                accentColor="rose"
              />
            </div>

            {/* Saldo bancário por conta (fim do mês) */}
            {accountBalances.length > 0 && (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-300">
                    Saldo por Conta — fim de {monthName}/{year}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Total: <span className={cn('font-semibold tabular-nums', totalBankBalance < 0 ? 'text-rose-300' : 'text-cyan-200')}>{fmt(totalBankBalance)}</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accountBalances.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                        <span className="text-xs text-slate-200 truncate" title={a.name}>{a.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={cn('text-sm font-semibold tabular-nums', a.balance < 0 ? 'text-rose-300' : 'text-slate-100')}>{fmt(a.balance)}</div>
                        <div className={cn('text-[10px] tabular-nums', a.movimento < 0 ? 'text-rose-400/80' : 'text-emerald-400/80')}>
                          {a.movimento >= 0 ? '+' : ''}{fmt(a.movimento)} no mês
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Indicadores para o gestor */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <MiniStat label="A receber (pendente)" value={fmt(instSummary.toReceive)} tone="emerald" />
              <MiniStat label="A pagar (pendente)" value={fmt(instSummary.toPay)} tone="rose" />
              <MiniStat label="Transferências internas" value={fmt(stats.transferVolume)} tone="slate" />
              <MiniStat label="Sem categoria" value={`${stats.uncategorized} lanç.`} tone={stats.uncategorized ? 'amber' : 'slate'} />
            </div>



            {/* Carry-over balance */}
            <div className="relative overflow-hidden rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-blue-950/40 p-5">
              <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-cyan-500/10 blur-3xl" />
              <div className="relative space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-400/30">
                      <TrendingUp className="w-5 h-5 text-cyan-300" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-cyan-300/70 font-medium">
                        Saldo para o próximo mês
                      </p>
                      <p className="text-xs text-slate-400">
                        {monthName}/{year} — {stats.count} lançamento{stats.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'text-3xl md:text-4xl font-bold tabular-nums',
                      finalBalance >= 0 ? 'text-cyan-200' : 'text-amber-300'
                    )}
                  >
                    {fmt(finalBalance)}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-4 text-xs text-slate-400 border-t border-cyan-500/10 pt-2">
                  <span>Saldo anterior: <span className="text-slate-200 tabular-nums">{fmt(parsedPrevBalance)}</span></span>
                  <span className="text-slate-600">+</span>
                  <span>Saldo do mês: <span className={cn('tabular-nums', stats.saldo >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{fmt(stats.saldo)}</span></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const StatCard = ({
  icon, label, value, accent, highlight,
}: { icon: React.ReactNode; label: string; value: string; accent: string; highlight?: boolean }) => (
  <div className={cn(
    'rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm',
    accent,
    highlight && 'shadow-lg shadow-cyan-500/10'
  )}>
    <div className="flex items-center gap-2 mb-2 opacity-90">
      {icon}
      <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
    </div>
    <div className="text-2xl font-bold tabular-nums">{value}</div>
  </div>
);

const CategoryList = ({
  title, items, total, accentColor,
}: { title: string; items: { id: string; name: string; color: string; value: number }[]; total: number; accentColor: 'emerald' | 'rose' }) => {
  const headerColor = accentColor === 'emerald' ? 'text-emerald-300' : 'text-rose-300';
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      <h3 className={cn('text-sm font-semibold mb-3 uppercase tracking-wider', headerColor)}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">Sem lançamentos no período</p>
      ) : (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {items.map(item => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-slate-200 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-400 text-[10px] tabular-nums">{pct.toFixed(1)}%</span>
                    <span className="text-slate-100 font-medium tabular-nums">{fmt(item.value)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MiniStat = ({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'rose' | 'amber' | 'slate' }) => {
  const toneCls = {
    emerald: 'text-emerald-300 border-emerald-400/20',
    rose: 'text-rose-300 border-rose-400/20',
    amber: 'text-amber-300 border-amber-400/20',
    slate: 'text-slate-300 border-slate-700/60',
  }[tone];
  return (
    <div className={cn('rounded-lg border bg-slate-900/60 px-3 py-2', toneCls)}>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
};

export default MonthlySummaryDialog;

