import { describe, expect, it } from 'vitest';
import { computeBankReconciliation } from '@/lib/bankReconciliation';
import { computeMonthlyClosing } from '@/lib/accountBalances';
import type { StatementBalance } from '@/lib/statementBalances';

const statement = (account_id: string, balance_date: string, balance: number): StatementBalance => ({
  organization_id: 'org', account_id, balance_date, balance, source: 'manual',
});

describe('bank reconciliation', () => {
  it('explains January bank cash without treating internal applications as expenses', () => {
    const result = computeBankReconciliation([
      { id: 'bank', name: 'Banco', opening_balance: 33313.25, opening_balance_date: '2025-12-31' },
    ], [], [
      { account_id: 'bank', date: '2026-01-05', amount: 319877.64, is_transfer: false },
      { account_id: 'bank', date: '2026-01-06', amount: -276975.22, is_transfer: false },
      { account_id: 'bank', date: '2026-01-10', amount: -52053.03, is_transfer: true },
      { account_id: 'bank', date: '2026-01-15', amount: 2904.99, is_transfer: true },
    ], '2026-01-01', '2026-02-01');
    expect(computeMonthlyClosing(33313.25, 319877.64, 276975.22, []).subtotal).toBe(76215.67);
    expect(result.internalMovement).toBe(-49148.04);
    expect(result.final).toBe(27067.63);
    expect(result.anchorDifference).toBe(0);
  });

  it('sums bank accounts and excludes investment and unlinked transactions', () => {
    const result = computeBankReconciliation([
      { id: 'a', name: 'Banco A', opening_balance: 100 },
      { id: 'b', name: 'Banco B', opening_balance: 200 },
      { id: 'investment', name: 'Aplicação', kind: 'investment', opening_balance: 9000 },
    ], [], [
      { account_id: 'a', date: '2026-01-10', amount: -50, is_transfer: true },
      { account_id: 'b', date: '2026-01-10', amount: 50, is_transfer: true },
      { account_id: null, date: '2026-01-10', amount: 9999 },
      { account_id: 'unknown', date: '2026-01-10', amount: 9999 },
      { account_id: 'investment', date: '2026-01-10', amount: 9999 },
      { account_id: 'a', date: '2026-02-01', amount: 9999 },
    ], '2026-01-01', '2026-02-01');
    expect(result.rows.map(row => row.final)).toEqual([50, 250]);
    expect(result.final).toBe(300);
    expect(result.internalMovement).toBe(0);
  });

  it('uses latest statements and exposes a mismatch rather than hiding it', () => {
    const accounts = [{ id: 'a', name: 'Banco', opening_balance: 0 }];
    const statements = [statement('a', '2025-12-31', 100), statement('a', '2026-01-31', 75)];
    const txs = [{ account_id: 'a', date: '2026-01-15', amount: -20 }];
    const january = computeBankReconciliation(accounts, statements, txs, '2026-01-01', '2026-02-01');
    const february = computeBankReconciliation(accounts, statements, txs, '2026-02-01', '2026-03-01');
    expect(january.previous).toBe(100);
    expect(january.final).toBe(75);
    expect(january.rows[0].statementDiff).toBe(5);
    expect(january.anchorDifference).toBe(-5);
    expect(february.previous).toBe(january.final);
  });
});