import { describe, expect, it } from 'vitest';
import { computePeriodCashBalance } from '@/lib/accountBalances';

describe('computePeriodCashBalance', () => {
  const accounts = [
    { id: 'bank-a', opening_balance: 1000, opening_balance_date: '2026-01-01' },
    { id: 'bank-b', opening_balance: 500, opening_balance_date: null },
    { id: 'future', opening_balance: 900, opening_balance_date: '2026-03-01' },
  ];

  it('includes opening balances and all linked movements, including transfers', () => {
    const result = computePeriodCashBalance(
      accounts,
      [
        { account_id: 'bank-a', date: '2025-12-31', amount: 999 },
        { account_id: 'bank-a', date: '2026-01-01', amount: 100 },
        { account_id: 'bank-b', date: '2025-12-20', amount: -50 },
        { account_id: null, date: '2025-12-20', amount: 800 },
        { account_id: 'unknown', date: '2025-12-20', amount: 700 },
      ],
      [
        { account_id: 'bank-a', date: '2026-02-05', amount: -300 },
        { account_id: 'bank-b', date: '2026-02-05', amount: 300 },
        { account_id: 'bank-a', date: '2026-02-06', amount: 125.55 },
        { account_id: 'future', date: '2026-02-07', amount: 25 },
        { account_id: 'unknown', date: '2026-02-06', amount: 400 },
      ],
      '2026-02-01',
    );

    expect(result.calculatedPreviousBalance).toBe(1550);
    expect(result.monthlyMovement).toBe(150.55);
    expect(result.finalBalance).toBe(1700.55);
  });

  it('uses a manual previous balance without changing the monthly movement', () => {
    const result = computePeriodCashBalance(
      accounts,
      [],
      [{ account_id: 'bank-a', date: '2026-02-05', amount: 50 }],
      '2026-02-01',
      2000,
    );

    expect(result.calculatedPreviousBalance).toBe(1500);
    expect(result.previousBalance).toBe(2000);
    expect(result.monthlyMovement).toBe(50);
    expect(result.finalBalance).toBe(2050);
  });
});