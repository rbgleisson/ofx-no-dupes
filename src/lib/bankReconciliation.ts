import { computeAnchoredBalance, type BalanceAccount, type BalanceTx, type StatementBalance } from '@/lib/statementBalances';
import { round2 } from '@/lib/accountBalances';

interface BankAccount extends BalanceAccount {
  name: string;
  kind?: string;
}

interface BankTransaction extends BalanceTx {
  is_transfer?: boolean;
}

/** Bank cash is separate from the organization's operational monthly chain. */
export function computeBankReconciliation(
  accounts: BankAccount[],
  statements: StatementBalance[],
  transactions: BankTransaction[],
  periodStart: string,
  periodEnd: string,
) {
  const rows = accounts.filter(account => account.kind !== 'investment').map(account => {
    const txs = transactions.filter(tx => tx.account_id === account.id);
    const previous = computeAnchoredBalance(account, statements, txs, periodStart);
    const closing = computeAnchoredBalance(account, statements, txs, periodEnd);
    const monthTxs = txs.filter(tx => tx.date >= periodStart && tx.date < periodEnd);
    const sum = (items: BankTransaction[]) => round2(items.reduce((total, tx) => total + Number(tx.amount || 0), 0));
    const credits = sum(monthTxs.filter(tx => tx.amount > 0));
    const debits = round2(-sum(monthTxs.filter(tx => tx.amount < 0)));
    const realMovement = sum(monthTxs.filter(tx => !tx.is_transfer));
    const internalMovement = sum(monthTxs.filter(tx => tx.is_transfer));
    const statement = statements.filter(s => s.account_id === account.id && s.balance_date >= periodStart && s.balance_date < periodEnd)
      .sort((a, b) => a.balance_date.localeCompare(b.balance_date)).pop();
    const statementDiff = statement
      ? round2(computeAnchoredBalance(account, statements, txs, statement.balance_date, true).balance - statement.balance)
      : null;
    return {
      id: account.id, name: account.name, previous: previous.balance, credits, debits,
      final: closing.balance, hasAnchor: closing.hasAnchor, realMovement, internalMovement,
      anchorDifference: round2(closing.balance - previous.balance - realMovement - internalMovement),
      statement, statementDiff,
    };
  });
  const total = (key: 'previous' | 'final' | 'realMovement' | 'internalMovement' | 'anchorDifference') =>
    round2(rows.reduce((sum, row) => sum + row[key], 0));
  return { rows, previous: total('previous'), final: total('final'), realMovement: total('realMovement'), internalMovement: total('internalMovement'), anchorDifference: total('anchorDifference') };
}