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
  installments: Installment[]
): AccountBalance[] {
  return accounts.map(acc => {
    const opening = round2(Number((acc as any).opening_balance ?? 0));
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (t.account_id !== acc.id) continue;
      const amt = Number(t.amount) || 0;
      if (amt >= 0) income += amt;
      else expense += Math.abs(amt);
    }
    income = round2(income);
    expense = round2(expense);
    const realized = round2(opening + income - expense);

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
