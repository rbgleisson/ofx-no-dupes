import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Download, Loader2, Building2 } from 'lucide-react';
import { Category } from '@/components/CategoriesManager';
import { exportMonthlySummary } from '@/lib/monthlySummaryExport';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import AccountBalanceCards from './AccountBalanceCards';
import type { Account } from './AccountsManager';
import type { Transaction } from '@/lib/transactionStore';
import type { Installment } from '@/lib/installmentStore';

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
  id: string;
  date: string;
  description: string;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  is_transfer?: boolean | null;
}

interface Acct {
  id: string;
  name: string;
  color: string;
  created_at: string;
  opening_balance: number | null;
  opening_balance_date: string | null;
}

interface Inst {
  id: string;
  type: string;
  amount: number;
  due_date: string;
  is_paid: boolean;
  account_id: string | null;
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
              .select('id, date, description, amount, category_id, account_id, is_transfer')
              .gte('date', startDate).lt('date', endDate).order('date')
          )),
          fetchAll<Tx>(() => scoped(
            supabase.from('transactions')
              .select('id, date, description, amount, category_id, account_id, is_transfer')
              .lt('date', startDate).order('date')
          )),
          fetchAll<Acct>(() => scoped(
            supabase.from('accounts')
              .select('id, name, color, created_at, opening_balance, opening_balance_date').order('name')
          )),
          fetchAll<Inst>(() => scoped(
            supabase.from('installments')
              .select('id, type, amount, due_date, is_paid, account_id')
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
    let totalEntries = 0;
    let totalExits = 0;
    let transferVolume = 0;
    let count = 0;
    for (const tx of txs) {
      if (tx.is_transfer) { transferVolume += Math.abs(Number(tx.amount) || 0); continue; }
      count++;
      if (tx.amount >= 0) {
        totalEntries += tx.amount;
      } else {
        totalExits += Math.abs(tx.amount);
      }
    }
    return {
      totalEntries,
      totalExits,
      saldo: totalEntries - totalExits,
      count,
      transferVolume,
      uncategorized: txs.filter(t => !t.is_transfer && !t.category_id).length,
    };
  }, [txs]);

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

  const allTransactions = useMemo(() => [...priorTxs, ...txs], [priorTxs, txs]);

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

  const finalBalance = Math.round((parsedPrevBalance + bankMovement) * 100) / 100;

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
              Saldo Anterior (editável)
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
          <div className="space-y-5 pt-2">
            {/* Resumo simples */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4 text-sm">
              <div>
                <p className="text-[10px] uppercase text-slate-400">Entradas Reais</p>
                <p className="font-semibold text-emerald-400 tabular-nums">{fmt(stats.totalEntries)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400">Despesas Reais</p>
                <p className="font-semibold text-rose-400 tabular-nums">{fmt(stats.totalExits)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400">Resultado Real</p>
                <p className={cn('font-semibold tabular-nums', stats.saldo >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {fmt(stats.saldo)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-400">Lançamentos</p>
                <p className="font-semibold text-slate-200 tabular-nums">{stats.count}</p>
              </div>
            </div>

            {/* Saldo por conta — componente existente */}
            <AccountBalanceCards
              accounts={accounts}
              transactions={allTransactions as unknown as Transaction[]}
              installments={insts as unknown as Installment[]}
            />

            {/* Indicadores adicionais (sem cards) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4 text-xs">
              <div>
                <p className="text-slate-500">A receber pendente</p>
                <p className="font-medium tabular-nums text-emerald-400">{fmt(instSummary.toReceive)}</p>
              </div>
              <div>
                <p className="text-slate-500">A pagar pendente</p>
                <p className="font-medium tabular-nums text-rose-400">{fmt(instSummary.toPay)}</p>
              </div>
              <div>
                <p className="text-slate-500">Transferências internas</p>
                <p className="font-medium tabular-nums text-slate-200">{fmt(stats.transferVolume)}</p>
              </div>
              <div>
                <p className="text-slate-500">Sem categoria</p>
                <p className={cn('font-medium tabular-nums', stats.uncategorized ? 'text-amber-400' : 'text-slate-200')}>
                  {stats.uncategorized} lanç.
                </p>
              </div>
            </div>

            {/* Conciliação do saldo para o próximo mês */}
            <div className="border-t border-cyan-500/10 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Saldo anterior</span>
                <span className="tabular-nums text-slate-200">{fmt(parsedPrevBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Movimento bancário do mês</span>
                <span className={cn('tabular-nums', bankMovement >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {fmt(bankMovement)}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold pt-1">
                <span>Saldo para o próximo mês</span>
                <span className={cn('tabular-nums', finalBalance >= 0 ? 'text-cyan-300' : 'text-amber-300')}>
                  {fmt(finalBalance)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Total realizado em contas</span>
                <span className={cn('tabular-nums', totalBankBalance < 0 ? 'text-rose-400' : 'text-slate-200')}>
                  {fmt(totalBankBalance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MonthlySummaryDialog;
