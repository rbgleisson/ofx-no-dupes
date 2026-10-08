import { supabase } from '@/integrations/supabase/client';

export interface StatementBalance {
  id?: string;
  organization_id: string;
  account_id: string;
  balance_date: string;
  balance: number;
  source: 'ofx' | 'manual';
  created_at?: string;
}

export interface BalanceAccount {
  id: string;
  opening_balance?: number | null;
  opening_balance_date?: string | null;
}

export interface BalanceTx {
  account_id?: string | null;
  date: string;
  amount: number;
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export async function fetchStatementBalances(organizationId: string, accountId?: string): Promise<StatementBalance[]> {
  const rows: StatementBalance[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('account_statement_balances').select('*')
      .eq('organization_id', organizationId)
      .order('balance_date', { ascending: true }).order('id', { ascending: true });
    if (accountId) q = q.eq('account_id', accountId);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    const page = (data || []).map(d => ({ ...d, source: d.source as StatementBalance['source'], balance: Number(d.balance) }));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function upsertStatementBalance(row: Omit<StatementBalance, 'id' | 'created_at'>) {
  const { error } = await supabase
    .from('account_statement_balances')
    .upsert({ ...row, balance: r2(row.balance) }, { onConflict: 'account_id,balance_date' });
  if (error) throw error;
}

export async function deleteStatementBalance(id: string) {
  const { error } = await supabase.from('account_statement_balances').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Saldo da conta calculado a partir da âncora mais recente do extrato com
 * balance_date < untilDate. Soma todos os lançamentos da conta (inclusive
 * transferências) após a âncora e antes de untilDate (ou até untilDate,
 * quando inclusive). Sem âncora, usa opening_balance/opening_balance_date.
 */
export function computeAnchoredBalance(
  account: BalanceAccount,
  statements: StatementBalance[],
  txs: BalanceTx[],
  untilDate: string,
  inclusive = false,
): { balance: number; hasAnchor: boolean } {
  const anchor = statements
    .filter(s => s.account_id === account.id && s.balance_date < untilDate)
    .sort((a, b) => a.balance_date.localeCompare(b.balance_date))
    .pop();
  const openingDate = account.opening_balance_date ? String(account.opening_balance_date).slice(0, 10) : null;
  let total = anchor ? Number(anchor.balance) : Number(account.opening_balance || 0);
  for (const t of txs) {
    if (t.account_id && t.account_id !== account.id) continue;
    const d = String(t.date).slice(0, 10);
    if (inclusive ? d > untilDate : d >= untilDate) continue;
    if (anchor) {
      if (d <= anchor.balance_date) continue;
    } else if (openingDate && d < openingDate) continue;
    total += Number(t.amount) || 0;
  }
  return { balance: r2(total), hasAnchor: !!anchor };
}
