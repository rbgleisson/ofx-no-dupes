import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { computeMonthlyClosing, round2, type CashBalanceAccount } from '@/lib/accountBalances';
import { computeMonthlyPreviousBalance, fetchOpeningAnchors, isSameOpeningPeriod } from '@/lib/monthlyOpeningBalance';
import { fetchInvestmentSummary } from '@/lib/investmentPositions';

export interface CashflowRow {
  id?: string;
  date: string;
  amount: number;
  account_id?: string | null;
  is_transfer?: boolean | null;
  description?: string | null;
  category_id?: string | null;
}

export interface ExcludedGroup<T> { count: number; sum: number; items: T[] }

export interface MonthCashflow<T extends CashflowRow = CashflowRow> {
  entries: number;
  exits: number;
  entriesCount: number;
  exitsCount: number;
  included: T[];
  transfers: ExcludedGroup<T>;
  noAccount: ExcludedGroup<T>;
}

/**
 * Regra única de Entradas e Saídas do mês: transferências internas e
 * lançamentos sem conta bancária ficam de fora (mas são contados à parte).
 */
export function splitMonthCashflow<T extends CashflowRow>(rows: T[]): MonthCashflow<T> {
  const result: MonthCashflow<T> = {
    entries: 0, exits: 0, entriesCount: 0, exitsCount: 0, included: [],
    transfers: { count: 0, sum: 0, items: [] },
    noAccount: { count: 0, sum: 0, items: [] },
  };
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const group = row.is_transfer ? result.transfers : !row.account_id ? result.noAccount : null;
    if (group) { group.count++; group.sum += amount; group.items.push(row); continue; }
    result.included.push(row);
    if (amount >= 0) { result.entries += amount; result.entriesCount++; }
    else { result.exits += Math.abs(amount); result.exitsCount++; }
  }
  result.entries = round2(result.entries);
  result.exits = round2(result.exits);
  result.transfers.sum = round2(result.transfers.sum);
  result.noAccount.sum = round2(result.noAccount.sum);
  return result;
}

export type PreviousBalanceOrigin =
  | { kind: 'manual'; userLabel: string | null; savedAt: string | null }
  | { kind: 'chained'; userLabel: string | null; savedAt: string | null; year: number; month: number }
  | { kind: 'calculated' };

export interface MonthComposition {
  previousBalance: number;
  origin: PreviousBalanceOrigin;
  cashflow: MonthCashflow;
  monthBalance: number;
  totalApplied: number;
  totalWithInvestments: number;
}

const labelCache = new Map<string, string | null>();
export async function fetchMemberLabel(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  if (labelCache.has(userId)) return labelCache.get(userId)!;
  const { data } = await supabase.rpc('get_org_member_label', { _user_id: userId });
  const label = (data as string | null) ?? null;
  labelCache.set(userId, label);
  return label;
}

export async function fetchMonthComposition(organizationId: string, year: number, month: number): Promise<MonthComposition> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  const [monthRows, history, accountsResult, anchors, investments] = await Promise.all([
    fetchAllRows<CashflowRow>(() => supabase.from('transactions')
      .select('id, date, amount, account_id, is_transfer, description, category_id')
      .eq('organization_id', organizationId).gte('date', start).lt('date', end).order('date') as any),
    fetchAllRows<CashflowRow>(() => supabase.from('transactions')
      .select('id, date, amount, account_id, is_transfer')
      .eq('organization_id', organizationId).lt('date', start) as any),
    supabase.from('accounts').select('id, opening_balance, opening_balance_date').eq('organization_id', organizationId),
    fetchOpeningAnchors(organizationId, year, month),
    fetchInvestmentSummary(organizationId, year, month),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  const previous = computeMonthlyPreviousBalance((accountsResult.data || []) as CashBalanceAccount[], history, anchors, year, month);
  const current = anchors.find(a => isSameOpeningPeriod(a, year, month));
  const chain = current ? null : anchors[0];
  let origin: PreviousBalanceOrigin = { kind: 'calculated' };
  if (current) origin = { kind: 'manual', userLabel: await fetchMemberLabel(current.updated_by), savedAt: current.updated_at ?? null };
  else if (chain) origin = { kind: 'chained', userLabel: await fetchMemberLabel(chain.updated_by), savedAt: chain.updated_at ?? null, year: chain.year, month: chain.month };
  const cashflow = splitMonthCashflow(monthRows);
  const closing = computeMonthlyClosing(previous.displayed, cashflow.entries, cashflow.exits, investments.byAccount.map(a => a.aplicado));
  return {
    previousBalance: previous.displayed, origin, cashflow,
    monthBalance: closing.subtotal, totalApplied: closing.totalApplied, totalWithInvestments: closing.totalGeral,
  };
}
