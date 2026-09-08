import { supabase } from '@/integrations/supabase/client';
import type { Account } from '@/components/AccountsManager';
import type { Transaction } from '@/lib/transactionStore';
import type { Installment } from '@/lib/installmentStore';

/** Round to 2 decimal places to avoid IEEE-754 drift. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export interface AccountBalance {
  account: Account;
  opening: number;
  income: number;    // total positive posted transactions
  expense: number;   // total negative posted transactions (absolute)
  realized: number;  // opening + income - expense
  pendingIn: number; // receivable installments not paid
  pendingOut: number;// payable installments not paid
  projected: number; // realized + pendingIn - pendingOut
}

export function computeAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  installments: Installment[],
  /** Saldos informados manualmente (contas de aplicação): substituem o cálculo por transações. */
  balanceOverrides?: Map<string, number>
): AccountBalance[] {
  return accounts.map(acc => {
    const opening = round2(Number((acc as any).opening_balance ?? 0));
    const since: string | null = (acc as any).opening_balance_date ?? null;
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (t.account_id !== acc.id) continue;
      if (since && String(t.date).slice(0, 10) < since) continue;
      const amt = Number(t.amount) || 0;
      if (amt >= 0) income += amt;
      else expense += Math.abs(amt);
    }

    income = round2(income);
    expense = round2(expense);
    const override = balanceOverrides?.get(acc.id);
    const realized = override !== undefined ? round2(override) : round2(opening + income - expense);


    let pendingIn = 0;
    let pendingOut = 0;
    for (const i of installments) {
      if (i.account_id !== acc.id || i.is_paid) continue;
      const amt = Number(i.amount) || 0;
      if (i.type === 'receivable') pendingIn += amt;
      else pendingOut += amt;
    }
    pendingIn = round2(pendingIn);
    pendingOut = round2(pendingOut);
    const projected = round2(realized + pendingIn - pendingOut);

    return { account: acc, opening, income, expense, realized, pendingIn, pendingOut, projected };
  });
}

export interface AccountAdjustment {
  id: string;
  account_id: string;
  previous_balance: number;
  new_balance: number;
  delta: number;
  note: string | null;
  transaction_id: string | null;
  created_at: string;
}

/**
 * Apply a manual balance adjustment: creates a transaction with the delta
 * (flagged as internal transfer so it does not affect Entradas/Despesas Reais),
 * and writes a row into account_adjustments for audit history.
 */
export async function applyManualAdjustment(params: {
  accountId: string;
  currentRealized: number;
  newBalance: number;
  note?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!orgId) throw new Error('No organization found');

  const previous = round2(params.currentRealized);
  const next = round2(params.newBalance);
  const delta = round2(next - previous);

  if (delta === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const noteText = params.note?.trim() || 'Ajuste manual de saldo';

  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      date: today,
      amount: delta,
      description: `Ajuste de Saldo: ${noteText}`,
      memo: 'Ajuste manual de saldo',
      account_id: params.accountId,
      is_transfer: true,
      is_verified: true,
      user_id: user.id,
      organization_id: orgId as string,
    })
    .select('id')
    .single();
  if (txErr) throw txErr;

  const { error: adjErr } = await supabase.from('account_adjustments').insert({
    account_id: params.accountId,
    organization_id: orgId as string,
    user_id: user.id,
    previous_balance: previous,
    new_balance: next,
    delta,
    note: noteText,
    transaction_id: tx?.id ?? null,
  });
  if (adjErr) throw adjErr;
}

export async function fetchAdjustments(accountId: string): Promise<AccountAdjustment[]> {
  const { data, error } = await supabase
    .from('account_adjustments')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    ...r,
    previous_balance: Number(r.previous_balance),
    new_balance: Number(r.new_balance),
    delta: Number(r.delta),
  }));
}

export interface MonthlyBalanceRow {
  month: string;      // YYYY-MM
  income: number;
  expense: number;
  net: number;
  cumulative: number; // opening + net of all months up to this one
}

/**
 * Month-by-month evolution for one account (or all accounts combined).
 * Respects each account's opening_balance / opening_balance_date.
 */
export function computeMonthlySeries(
  accounts: Account[],
  transactions: Transaction[],
  accountId: string | 'all'
): MonthlyBalanceRow[] {
  const selected = accountId === 'all' ? accounts : accounts.filter(a => a.id === accountId);
  if (!selected.length) return [];
  const ids = new Set(selected.map(a => a.id));

  const opening = round2(selected.reduce((s, a) => s + Number((a as any).opening_balance ?? 0), 0));
  const sinceByAccount = new Map<string, string | null>(
    selected.map(a => [a.id, ((a as any).opening_balance_date ?? null) as string | null])
  );

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    if (!t.account_id || !ids.has(t.account_id)) continue;
    const d = String(t.date).slice(0, 10);
    const since = sinceByAccount.get(t.account_id) ?? null;
    if (since && d < since) continue;
    const key = d.slice(0, 7);
    const b = buckets.get(key) ?? { income: 0, expense: 0 };
    const amt = Number(t.amount) || 0;
    if (amt >= 0) b.income += amt;
    else b.expense += Math.abs(amt);
    buckets.set(key, b);
  }

  const months = Array.from(buckets.keys()).sort();
  let running = opening;
  return months.map(month => {
    const b = buckets.get(month)!;
    const income = round2(b.income);
    const expense = round2(b.expense);
    const net = round2(income - expense);
    running = round2(running + net);
    return { month, income, expense, net, cumulative: running };
  });
}
