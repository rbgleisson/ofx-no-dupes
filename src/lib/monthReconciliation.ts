import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { round2 } from '@/lib/accountBalances';
import { fetchStatementBalances } from '@/lib/statementBalances';
import { computeBankReconciliation } from '@/lib/bankReconciliation';

export interface MonthReconciliation {
  previousBalance: number;
  entries: number;
  exits: number;
  monthResult: number;
  monthBalance: number;
  internalNet: number;
  otherDifferences: number;
  bankFinal: number;
  totalApplied: number;
  totalWithInvestments: number;
}

/** Full month reconciliation; lines always add up exactly to bankFinal. */
export function buildMonthReconciliation(
  previousBalance: number, entries: number, exits: number,
  bank: { internalNet: number; final: number }, appliedAmounts: number[],
): MonthReconciliation {
  const monthResult = round2(entries - exits);
  const monthBalance = round2(previousBalance + monthResult);
  const internalNet = round2(bank.internalNet);
  const bankFinal = round2(bank.final);
  const otherDifferences = round2(bankFinal - monthBalance - internalNet);
  const totalApplied = round2(appliedAmounts.reduce((s, v) => s + Number(v || 0), 0));
  return {
    previousBalance: round2(previousBalance), entries: round2(entries), exits: round2(exits),
    monthResult, monthBalance, internalNet, otherDifferences, bankFinal,
    totalApplied, totalWithInvestments: round2(bankFinal + totalApplied),
  };
}

/** Bank reconciliation of the whole organization for a month (same inputs as BankAvailableSummary). */
export async function fetchBankMonthReconciliation(organizationId: string, year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  const [accountsResult, txs, statements] = await Promise.all([
    supabase.from('accounts').select('id, name, kind, opening_balance, opening_balance_date').eq('organization_id', organizationId),
    fetchAllRows<{ id: string; account_id: string | null; date: string; amount: number; is_transfer: boolean }>(() =>
      supabase.from('transactions').select('id, account_id, date, amount, is_transfer')
        .eq('organization_id', organizationId).not('account_id', 'is', null).lt('date', end) as any),
    fetchStatementBalances(organizationId),
  ]);
  if (accountsResult.error) throw accountsResult.error;
  return computeBankReconciliation((accountsResult.data || []) as any, statements, txs, start, end);
}
