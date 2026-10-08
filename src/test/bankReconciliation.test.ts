import { describe, expect, it } from 'vitest';
import { computeBankReconciliation } from '@/lib/bankReconciliation';
import type { StatementBalance } from '@/lib/statementBalances';

const statement = (account_id: string, balance_date: string, balance: number): StatementBalance =>
  ({ organization_id: 'org', account_id, balance_date, balance, source: 'manual' });
const start = '2026-01-01', end = '2026-02-01';

describe('bank reconciliation separate from subtotal', () => {
  it('includes applications without turning them into real expenses', () => {
    const result = computeBankReconciliation([{ id: 'bank', name: 'Banco', opening_balance: 33313.25 }], [], [
      { account_id: 'bank', date: '2026-01-10', amount: 319877.64, is_transfer: false },
      { account_id: 'bank', date: '2026-01-20', amount: -276975.22, is_transfer: false },
      { account_id: 'bank', date: '2026-01-25', amount: -49148.04, is_transfer: true },
    ], start, end);
    expect(result.realNet).toBe(42902.42);
    expect(result.internalNet).toBe(-49148.04);
    expect(result.final).toBe(27067.63);
  });
  it('excludes investment accounts and unlinked transactions from bank liquidity', () => {
    const result = computeBankReconciliation([
      { id: 'bank', name: 'Banco', opening_balance: 1000 },
      { id: 'investment', name: 'Aplicação', kind: 'investment', opening_balance: 5000 },
    ], [], [{ account_id: null, date: '2026-01-10', amount: 800 }], start, end);
    expect(result.final).toBe(1000);
    expect(result.rows).toHaveLength(1);
  });
  it('uses the latest closing statement and exposes discrepancies without adding fake transactions', () => {
    const result = computeBankReconciliation([{ id: 'bank', name: 'Banco', opening_balance: 1000 }], [
      statement('bank', '2025-12-31', 1000), statement('bank', '2026-01-30', 1200),
      statement('bank', '2026-02-10', 9999),
    ], [
      { account_id: 'bank', date: '2026-01-10', amount: 100 },
      { account_id: 'bank', date: '2026-01-31', amount: -20 },
    ], start, end);
    expect(result.previous).toBe(1000);
    expect(result.final).toBe(1180);
    expect(result.statementDifference).toBe(100);
  });
  it('cancels transfers between banks and chains a closing into the next opening', () => {
    const accounts = [{ id: 'a', name: 'A', opening_balance: 1000 }, { id: 'b', name: 'B', opening_balance: 500 }];
    const txs = [{ account_id: 'a', date: '2026-01-10', amount: -200, is_transfer: true }, { account_id: 'b', date: '2026-01-10', amount: 200, is_transfer: true }];
    const january = computeBankReconciliation(accounts, [], txs, start, end);
    const february = computeBankReconciliation(accounts, [], txs, end, '2026-03-01');
    expect(january.final).toBe(1500);
    expect(january.internalNet).toBe(0);
    expect(february.previous).toBe(january.final);
  });
});