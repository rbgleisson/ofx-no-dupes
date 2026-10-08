import { round2 } from '@/lib/accountBalances';
import { computeAnchoredBalance, type BalanceAccount, type BalanceTx, type StatementBalance } from '@/lib/statementBalances';

interface BankAccount extends BalanceAccount {
  name: string;
  kind?: string | null;
}
interface BankTransaction extends BalanceTx { is_transfer?: boolean | null }

/** Bank-only reconciliation; manual org anchors and investment positions never enter it. */
export function computeBankReconciliation(
  accounts: BankAccount[], statements: StatementBalance[], transactions: BankTransaction[],
  start: string, end: string,
) {
  const rows = accounts.filter(account => account.kind !== 'investment').map(account => {
    const txs = transactions.filter(tx => tx.account_id === account.id);
    const accountStatements = statements.filter(s => s.account_id === account.id);
    const balanceAt = (date: string) => {
      if (account.opening_balance_date && account.opening_balance_date > date &&
          !accountStatements.some(s => s.balance_date < date)) return 0;
      return computeAnchoredBalance(account, accountStatements, txs, date).balance;
    };
    const previous = balanceAt(start);
    const final = balanceAt(end);
    const monthly = txs.filter(tx => tx.date >= start && tx.date < end &&
      (!account.opening_balance_date || tx.date >= account.opening_balance_date));
    const realNet = round2(monthly.filter(tx => !tx.is_transfer).reduce((sum, tx) => sum + Number(tx.amount), 0));
    const internalNet = round2(monthly.filter(tx => tx.is_transfer).reduce((sum, tx) => sum + Number(tx.amount), 0));
    const statementDifference = round2(final - previous - realNet - internalNet);
    const latest = accountStatements.filter(s => s.balance_date < end)
      .sort((a, b) => a.balance_date.localeCompare(b.balance_date)).pop();
    return { id: account.id, name: account.name, previous, realNet, internalNet, statementDifference, final, anchorDate: latest?.balance_date };
  });
  const sum = (field: 'previous' | 'realNet' | 'internalNet' | 'statementDifference' | 'final') =>
    round2(rows.reduce((total, row) => total + row[field], 0));
  return { rows, previous: sum('previous'), realNet: sum('realNet'), internalNet: sum('internalNet'), statementDifference: sum('statementDifference'), final: sum('final') };
}