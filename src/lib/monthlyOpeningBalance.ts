import { supabase } from '@/integrations/supabase/client';
import { round2, type CashBalanceAccount } from '@/lib/accountBalances';

export interface MonthlyOpeningAnchor {
  id: string;
  organization_id: string;
  year: number;
  month: number;
  amount: number;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface ChainedTransaction {
  account_id?: string | null;
  date: string;
  amount: number;
  is_transfer?: boolean | null;
}

export interface MonthlyPreviousBalanceResult {
  calculated: number;
  displayed: number;
  hasSavedValue: boolean;
}

const periodKey = (year: number, month: number) => year * 12 + month;
const periodStartFor = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01`;

export async function fetchOpeningAnchors(
  organizationId: string,
  year: number,
  month: number,
): Promise<MonthlyOpeningAnchor[]> {
  const { data, error } = await supabase
    .from('monthly_opening_balances')
    .select('id, organization_id, year, month, amount, updated_by, updated_at')
    .eq('organization_id', organizationId)
    .or(`year.lt.${year},and(year.eq.${year},month.lte.${month})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(2);
  if (error) throw error;
  return (data || []).map(row => ({ ...row, amount: Number(row.amount) || 0 }));
}

export async function saveOpeningBalance(params: {
  organizationId: string;
  year: number;
  month: number;
  amount: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const { error } = await supabase.from('monthly_opening_balances').upsert({
    organization_id: params.organizationId,
    year: params.year,
    month: params.month,
    amount: round2(params.amount),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,year,month' });
  if (error) throw error;
}

export async function deleteOpeningBalance(
  organizationId: string,
  year: number,
  month: number,
): Promise<void> {
  const { error } = await supabase
    .from('monthly_opening_balances')
    .delete()
    .eq('organization_id', organizationId)
    .eq('year', year)
    .eq('month', month);
  if (error) throw error;
}

export function computeChainedPreviousBalance(
  anchor: MonthlyOpeningAnchor | null,
  transactionsBeforePeriod: ChainedTransaction[],
  periodStart: string,
  fallback: number,
): number {
  if (!anchor) return round2(fallback);
  const anchorStart = periodStartFor(anchor.year, anchor.month);
  if (anchorStart === periodStart) return round2(anchor.amount);

  const movement = transactionsBeforePeriod.reduce((sum, transaction) => {
    if (!transaction.account_id || transaction.is_transfer || transaction.date < anchorStart || transaction.date >= periodStart) return sum;
    return sum + Number(transaction.amount || 0);
  }, 0);
  return round2(anchor.amount + movement);
}

/**
 * Shared monthly opening-balance rule used by the dashboard, summary and Excel.
 * A saved value is the source of truth for its month. Without one, later months
 * inherit the latest manual anchor, or January's bank balance when no anchor exists.
 */
export function computeMonthlyPreviousBalance(
  accounts: CashBalanceAccount[],
  transactionsBeforePeriod: ChainedTransaction[],
  anchors: MonthlyOpeningAnchor[],
  year: number,
  month: number,
): MonthlyPreviousBalanceResult {
  const periodStart = periodStartFor(year, month);
  const yearStart = periodStartFor(year, 1);
  const currentAnchor = anchors.find(item => isSameOpeningPeriod(item, year, month)) || null;
  const priorAnchor = anchors.find(item => !isSameOpeningPeriod(item, year, month)) || null;
  const chainAnchor = currentAnchor ? priorAnchor : anchors[0] || null;

  const accountOpeningDates = new Map(
    accounts.map(account => [account.id, account.opening_balance_date || null]),
  );
  const implicitYearOpening = round2(
    accounts.reduce((sum, account) => {
      const openingDate = account.opening_balance_date;
      return !openingDate || openingDate <= yearStart
        ? sum + Number(account.opening_balance || 0)
        : sum;
    }, 0) + transactionsBeforePeriod.reduce((sum, transaction) => {
      if (transaction.date >= yearStart || !transaction.account_id || !accountOpeningDates.has(transaction.account_id)) return sum;
      const openingDate = accountOpeningDates.get(transaction.account_id);
      if (openingDate && transaction.date < openingDate) return sum;
      return sum + Number(transaction.amount || 0);
    }, 0),
  );

  const calculated = chainAnchor
    ? computeChainedPreviousBalance(chainAnchor, transactionsBeforePeriod, periodStart, implicitYearOpening)
    : round2(
      implicitYearOpening
      + accounts.reduce((sum, account) => {
        const openingDate = account.opening_balance_date;
        return openingDate && openingDate > yearStart && openingDate <= periodStart
          ? sum + Number(account.opening_balance || 0)
          : sum;
      }, 0)
      + transactionsBeforePeriod.reduce((sum, transaction) => {
        if (transaction.is_transfer || transaction.date < yearStart || transaction.date >= periodStart) return sum;
        if (!transaction.account_id || !accountOpeningDates.has(transaction.account_id)) return sum;
        const openingDate = accountOpeningDates.get(transaction.account_id);
        if (openingDate && transaction.date < openingDate) return sum;
        return sum + Number(transaction.amount || 0);
      }, 0),
    );

  return {
    calculated,
    displayed: currentAnchor ? round2(currentAnchor.amount) : calculated,
    hasSavedValue: Boolean(currentAnchor),
  };
}

export function isSameOpeningPeriod(
  anchor: MonthlyOpeningAnchor,
  year: number,
  month: number,
): boolean {
  return periodKey(anchor.year, anchor.month) === periodKey(year, month);
}