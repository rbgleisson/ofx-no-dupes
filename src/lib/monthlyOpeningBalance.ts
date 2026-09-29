import { supabase } from '@/integrations/supabase/client';
import { round2 } from '@/lib/accountBalances';

export interface MonthlyOpeningAnchor {
  id: string;
  organization_id: string;
  year: number;
  month: number;
  amount: number;
}

export interface ChainedTransaction {
  date: string;
  amount: number;
  is_transfer?: boolean | null;
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
    .select('id, organization_id, year, month, amount')
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
    if (transaction.is_transfer || transaction.date < anchorStart || transaction.date >= periodStart) return sum;
    return sum + Number(transaction.amount || 0);
  }, 0);
  return round2(anchor.amount + movement);
}

export function isSameOpeningPeriod(
  anchor: MonthlyOpeningAnchor,
  year: number,
  month: number,
): boolean {
  return periodKey(anchor.year, anchor.month) === periodKey(year, month);
}