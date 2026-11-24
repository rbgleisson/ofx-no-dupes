import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownCircle, ArrowUpCircle, BarChart3, Download, Loader2, Plus, TrendingUp, Wallet, Building2 } from 'lucide-react';
import { Category } from '@/components/CategoriesManager';
import { exportMonthlySummary, fetchInvestmentSummary } from '@/lib/monthlySummaryExport';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { type CashBalanceAccount } from '@/lib/accountBalances';
import { buildMonthReconciliation, fetchBankMonthReconciliation } from '@/lib/monthReconciliation';
import { saveAppliedAmount } from '@/lib/investmentPositions';
import { createInvestmentAccount } from '@/lib/transfers';
import {
  fetchMonthlyOpeningBalance,
  deleteOpeningBalance,
  fetchOpeningAnchors,
  saveOpeningBalance,
} from '@/lib/monthlyOpeningBalance';
import { toast } from 'sonner';
import { fetchMonthClosure } from '@/lib/monthClosure';
import { splitMonthCashflow } from '@/lib/monthComposition';
import { MonthCompositionDetails } from '@/components/MonthCompositionPanel';

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
  amount: number;
  account_id: string | null;
  category_id: string | null;
  is_transfer?: boolean | null;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MonthlySummaryDialog = ({ categories, chartAccounts = [], organizationId, orgName, onSuccess, onError, trigger }: Props) => {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [bankRecState, setBankRecState] = useState({ internalNet: 0, final: 0 });
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [headerName, setHeaderName] = useState<string>(orgName || '');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [investmentBalance, setInvestmentBalance] = useState<number>(0);
  const [investmentYield, setInvestmentYield] = useState<number>(0);
  const [investmentByAccount, setInvestmentByAccount] = useState<{ accountId: string; name: string; saldo: number; rendimento: number; aplicado: number }[]>([]);
  const [appliedInputs, setAppliedInputs] = useState<Record<string, string>>({});
  const [savingApplied, setSavingApplied] = useState<string | null>(null);
  const [newInvestmentName, setNewInvestmentName] = useState('');
  const [addingInvestment, setAddingInvestment] = useState(false);
  const [previousBalance, setPreviousBalance] = useState<number>(0);
  const [prevBalanceInput, setPrevBalanceInput] = useState<string>('0,00');
  const [prevBalanceEdited, setPrevBalanceEdited] = useState(false);
  const [hasSavedPreviousBalance, setHasSavedPreviousBalance] = useState(false);
  const [savingPreviousBalance, setSavingPreviousBalance] = useState(false);
  const [monthClosed, setMonthClosed] = useState(false);

  useEffect(() => {
    if (orgName && !headerName) setHeaderName(orgName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgName]);

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  useEffect(() => {
    if (!open) return;
    if (!organizationId) { setTxs([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const y = Number(year);
      const m = Number(month);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const [data, prevData, accountsResult, invSummary, openingAnchors, closure, bankRec] = await Promise.all([
        fetchAllRows<Tx>(() => supabase
          .from('transactions')
          .select('id, date, amount, account_id, category_id, is_transfer')
          .eq('organization_id', organizationId)
          .gte('date', startDate)
          .lt('date', endDate)),
        fetchAllRows<Tx>(() => supabase
          .from('transactions')
          .select('id, date, amount, account_id, category_id, is_transfer')
          .eq('organization_id', organizationId)
          .lt('date', startDate)),
        supabase
          .from('accounts')
          .select('id, opening_balance, opening_balance_date')
          .eq('organization_id', organizationId),
        fetchInvestmentSummary(organizationId, y, m),
        fetchOpeningAnchors(organizationId, y, m),
        fetchMonthClosure(organizationId, y, m),
        fetchBankMonthReconciliation(organizationId, y, m),
      ]);
      if (accountsResult.error) throw accountsResult.error;
      if (!cancelled) {
        setTxs(data);
        setMonthClosed(Boolean(closure));
        setBankRecState({ internalNet: bankRec.internalNet, final: bankRec.final });
        setInvestmentBalance(invSummary.totalSaldo);
        setInvestmentYield(invSummary.totalRendimento);
        setInvestmentByAccount(invSummary.byAccount);
        setAppliedInputs(Object.fromEntries(invSummary.byAccount.map(account => [
          account.accountId,
          account.aplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ])));
        const monthlyBalance = await fetchMonthlyOpeningBalance(organizationId, y, m);
        if (cancelled) return;
        setPreviousBalance(monthlyBalance.calculated);
        setPrevBalanceInput(monthlyBalance.displayed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setHasSavedPreviousBalance(monthlyBalance.hasSavedValue);
        setPrevBalanceEdited(false);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, year, month, organizationId]);

  const parsedPrevBalance = useMemo(() => {
    const cleaned = prevBalanceInput.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }, [prevBalanceInput]);

  const parseAmount = (value: string) => {
    const cleaned = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const stats = useMemo(() => {
    const entriesByCat = new Map<string, number>();
    const exitsByCat = new Map<string, number>();
    const cashflow = splitMonthCashflow(txs);
    const totalEntries = cashflow.entries;
    const totalExits = cashflow.exits;
    for (const tx of cashflow.included) {
      const catKey = tx.category_id || '__none__';
      if (tx.amount >= 0) entriesByCat.set(catKey, (entriesByCat.get(catKey) || 0) + tx.amount);
      else exitsByCat.set(catKey, (exitsByCat.get(catKey) || 0) + Math.abs(tx.amount));
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
      entries: toList(entriesByCat),
      exits: toList(exitsByCat),
    };
  }, [txs, catMap]);

  const appliedAmounts = useMemo(
    () => investmentByAccount.map(account => parseAmount(appliedInputs[account.accountId] || '0')),
    [investmentByAccount, appliedInputs],
  );
  const closing = useMemo(
    () => buildMonthReconciliation(parsedPrevBalance, stats.totalEntries, stats.totalExits, bankRecState, appliedAmounts),
    [parsedPrevBalance, stats.totalEntries, stats.totalExits, appliedAmounts, bankRecState],
  );

  const persistAppliedAmount = async (accountId: string) => {
    if (monthClosed) return;
    const value = parseAmount(appliedInputs[accountId] || '0');
    setAppliedInputs(current => ({
      ...current,
      [accountId]: value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }));
    setSavingApplied(accountId);
    try {
      await saveAppliedAmount({ accountId, year: Number(year), month: Number(month), amount: value });
      setInvestmentByAccount(current => current.map(account => (
        account.accountId === accountId ? { ...account, aplicado: value } : account
      )));
    } catch {
      toast.error('Não foi possível salvar o valor aplicado.');
      throw new Error('Falha ao salvar valor aplicado');
    } finally {
      setSavingApplied(current => current === accountId ? null : current);
    }
  };

  const persistPreviousBalance = async (inputValue = prevBalanceInput) => {
    if (monthClosed) return;
    if (!organizationId) return;
    const value = parseAmount(inputValue);
    setPrevBalanceInput(value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (!prevBalanceEdited) return;
    setSavingPreviousBalance(true);
    try {
      await saveOpeningBalance({
        organizationId,
        year: Number(year),
        month: Number(month),
        amount: value,
      });
      setHasSavedPreviousBalance(true);
      setPrevBalanceEdited(false);
    } catch {
      toast.error('Não foi possível salvar o Saldo Anterior.');
      throw new Error('Falha ao salvar Saldo Anterior');
    } finally {
      setSavingPreviousBalance(false);
    }
  };

  const restorePreviousBalance = async () => {
    if (!organizationId) return;
    setSavingPreviousBalance(true);
    try {
      if (hasSavedPreviousBalance) {
        await deleteOpeningBalance(organizationId, Number(year), Number(month));
      }
      setPrevBalanceInput(previousBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setHasSavedPreviousBalance(false);
      setPrevBalanceEdited(false);
    } catch {
      toast.error('Não foi possível restaurar o Saldo Anterior.');
    } finally {
      setSavingPreviousBalance(false);
    }
  };

  const addInvestmentField = async () => {
    const name = newInvestmentName.trim();
    if (!name || !organizationId) return;
    setAddingInvestment(true);
    try {
      await createInvestmentAccount({ name });
      const summary = await fetchInvestmentSummary(organizationId, Number(year), Number(month));
      setInvestmentBalance(summary.totalSaldo);
      setInvestmentYield(summary.totalRendimento);
      setInvestmentByAccount(summary.byAccount);
      setAppliedInputs(current => ({
        ...current,
        ...Object.fromEntries(summary.byAccount
          .filter(account => current[account.accountId] === undefined)
          .map(account => [account.accountId, account.aplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })])),
      }));
      setNewInvestmentName('');
      toast.success('Campo de aplicação adicionado.');
    } catch {
      toast.error('Não foi possível adicionar a aplicação.');
    } finally {
      setAddingInvestment(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      if (!monthClosed) await Promise.all([
        persistPreviousBalance(),
        ...investmentByAccount.map(account => persistAppliedAmount(account.accountId)),
      ]);
      await exportMonthlySummary(
        categories,
        organizationId,
        Number(year),
        Number(month),
        chartAccounts,
        (headerName || orgName || '').trim(),
        parsedPrevBalance,
      );
      onSuccess?.();
    } catch {
      onError?.();
    } finally {
      setExporting(false);
    }
  };

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
               <Select value={year} onValueChange={(value) => { setPrevBalanceEdited(false); setYear(value); }}>
                <SelectTrigger className="h-9 text-sm bg-slate-900/80 border-cyan-500/20"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <p className="text-[10px] font-medium text-cyan-300/70 uppercase tracking-wider mb-1">Mês</p>
               <Select value={month} onValueChange={(value) => { setPrevBalanceEdited(false); setMonth(value); }}>
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
               <Wallet className="w-3 h-3" /> Saldo Anterior {monthClosed ? '(mês fechado)' : '(editável)'}
               <span className="text-[9px] text-slate-500 normal-case tracking-normal">
                 {hasSavedPreviousBalance ? '— definido por você (salvo)' : '— calculado a partir dos saldos das contas no fim do mês anterior'}
               </span>
            </p>
            <Input
              value={prevBalanceInput}
              disabled={monthClosed || loading}
              onChange={(e) => { setPrevBalanceInput(e.target.value); setPrevBalanceEdited(true); }}
              onBlur={(event) => { void persistPreviousBalance(event.currentTarget.value).catch(() => undefined); }}
              placeholder="0,00"
              className="h-9 text-sm bg-slate-900/80 border-cyan-500/20 text-slate-100 tabular-nums pr-8"
            />
            {savingPreviousBalance && <Loader2 className="h-4 w-4 animate-spin text-cyan-300 mt-1" />}
            {(hasSavedPreviousBalance || prevBalanceEdited) && (
              <button
                type="button"
                onClick={() => { void restorePreviousBalance(); }}
                disabled={savingPreviousBalance || monthClosed}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

            {/* Monthly closing cascade */}
            <div className="relative overflow-hidden rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-blue-950/40 p-5">
              <div className="relative space-y-2 text-sm">
                <ClosingLine label="Saldo Anterior" value={parsedPrevBalance} />
                <ClosingLine label="(+) Entradas" value={stats.totalEntries} valueClass="text-emerald-300" />
                <ClosingLine label="(–) Saídas" value={stats.totalExits} valueClass="text-rose-300" />
                <div className="border-t border-cyan-500/20 pt-2">
                  <ClosingLine label="(=) Resultado do mês (Entradas − Saídas)" value={closing.monthResult} />
                </div>
                <ClosingLine label="Saldo do mês (Saldo Anterior + Resultado)" value={closing.monthBalance} strong />
                <ClosingLine label="(+/−) Aplicações, resgates e transferências (líquido)" value={closing.internalNet} />
                {closing.otherDifferences !== 0 && (
                  <ClosingLine label="(+/−) Outras diferenças (saldo anterior diferente, contas de aplicação, extrato)" value={closing.otherDifferences} valueClass="text-amber-300" />
                )}
                <div className="border-t border-cyan-500/20 pt-2">
                  <ClosingLine label="(=) Saldo disponível nos bancos no fim do mês" value={closing.bankFinal} strong />
                </div>
                {investmentByAccount.map(account => (
                  <div key={account.accountId} className="grid grid-cols-1 sm:grid-cols-[1fr_180px] items-center gap-2 border-t border-cyan-500/10 pt-2">
                    <label htmlFor={`aplicado-${account.accountId}`} className="text-slate-300">
                      (+) Saldo de Aplicação {account.name}
                    </label>
                    <div className="relative">
                      <Input
                        id={`aplicado-${account.accountId}`}
                        disabled={monthClosed}
                        inputMode="decimal"
                        value={appliedInputs[account.accountId] || '0,00'}
                        onChange={event => setAppliedInputs(current => ({ ...current, [account.accountId]: event.target.value }))}
                        onBlur={() => { void persistAppliedAmount(account.accountId).catch(() => undefined); }}
                        className="h-9 bg-slate-900/80 border-cyan-500/20 text-right tabular-nums pr-8"
                        aria-label={`Saldo de Aplicação ${account.name}`}
                      />
                      {savingApplied === account.accountId && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-cyan-300" />}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-end gap-2 border-t border-cyan-500/10 pt-3">
                  <div>
                    <label htmlFor="nova-aplicacao" className="mb-1 block text-xs text-slate-400">Nova aplicação</label>
                    <Input
                      id="nova-aplicacao"
                      disabled={monthClosed}
                      value={newInvestmentName}
                      onChange={event => setNewInvestmentName(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addInvestmentField();
                        }
                      }}
                      placeholder="Ex.: Poupança, CDB, RDC"
                      className="h-9 bg-slate-900/80 border-cyan-500/20"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void addInvestmentField()}
                    disabled={monthClosed || !newInvestmentName.trim() || addingInvestment}
                    className="h-9 border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10"
                  >
                    {addingInvestment ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                    Adicionar aplicação
                  </Button>
                </div>
                <div className="border-t border-cyan-400/30 pt-3 mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className="font-semibold uppercase text-cyan-200">(=) Total com aplicações</span>
                  <span className={cn('text-2xl md:text-3xl font-bold tabular-nums', closing.totalWithInvestments >= 0 ? 'text-cyan-200' : 'text-amber-300')}>
                    {fmt(closing.totalWithInvestments)}
                  </span>
                </div>
              </div>
            </div>

            <details className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4">
              <summary className="cursor-pointer text-sm font-medium text-cyan-200">Como foi calculado? (valores salvos)</summary>
              <div className="pt-3">
                <MonthCompositionDetails organizationId={organizationId} year={Number(year)} month={Number(month)} refreshKey={`${hasSavedPreviousBalance}-${monthClosed}-${investmentByAccount.map(a => a.aplicado).join(',')}`} />
              </div>
            </details>

            {/* Saldo e rendimento consolidados das aplicações */}
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span className="text-xs uppercase tracking-wider text-slate-300">
                    Saldo em aplicações financeiras (até {monthName}/{year})
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums text-cyan-200">{fmt(investmentBalance)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-cyan-500/10 pt-2">
                <span className="text-xs uppercase tracking-wider text-slate-300">
                  Rendimento das aplicações em {monthName}/{year}
                </span>
                <span className="text-sm font-semibold tabular-nums text-emerald-300">{fmt(investmentYield)}</span>
              </div>
              {investmentByAccount.length > 1 && (
                <div className="space-y-1 border-t border-cyan-500/10 pt-2">
                  {investmentByAccount.map(a => (
                    <div key={a.accountId} className="flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span className="truncate">{a.name}</span>
                      <span className="tabular-nums">
                        {fmt(a.saldo)} <span className="text-emerald-300">(+{fmt(a.rendimento)})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
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

const ClosingLine = ({
  label, value, valueClass, strong,
}: { label: string; value: number; valueClass?: string; strong?: boolean }) => (
  <div className={cn('flex items-center justify-between gap-3', strong && 'font-semibold text-cyan-100')}>
    <span className="text-slate-300">{label}</span>
    <span className={cn('tabular-nums text-slate-100', valueClass, strong && 'text-lg')}>{fmt(value)}</span>
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

export default MonthlySummaryDialog;
