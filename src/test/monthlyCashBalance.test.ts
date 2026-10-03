import { describe, expect, it } from 'vitest';
import { computeMonthlyClosing, computePeriodCashBalance } from '@/lib/accountBalances';
import { computeChainedPreviousBalance, computeMonthlyPreviousBalance, type MonthlyOpeningAnchor } from '@/lib/monthlyOpeningBalance';

const anchor = (year: number, month: number, amount: number): MonthlyOpeningAnchor => ({
  id: 'anchor', organization_id: 'org', year, month, amount,
});

describe('computeChainedPreviousBalance', () => {
  it('uses the fallback when there is no anchor', () => {
    expect(computeChainedPreviousBalance(null, [], '2026-02-01', 1550)).toBe(1550);
  });

  it('chains from the previous anchor and ignores transfers', () => {
    expect(computeChainedPreviousBalance(
      anchor(2026, 1, 1000),
      [
        { date: '2025-12-31', amount: 900, is_transfer: false },
        { date: '2026-01-05', amount: 250, is_transfer: false },
        { date: '2026-01-10', amount: -75, is_transfer: false },
        { date: '2026-01-15', amount: -500, is_transfer: true },
      ],
      '2026-02-01',
      0,
    )).toBe(1175);
  });

  it('uses the anchor amount unchanged in its own month', () => {
    expect(computeChainedPreviousBalance(
      anchor(2026, 1, 16113.96),
      [{ date: '2026-01-05', amount: 500, is_transfer: false }],
      '2026-01-01',
      0,
    )).toBe(16113.96);
  });

  it('uses one month subtotal as the following month opening balance', () => {
    expect(computeChainedPreviousBalance(
      anchor(2025, 12, 27278.61),
      [
        { date: '2025-12-05', amount: 338487.57, is_transfer: false },
        { date: '2025-12-20', amount: -347191.74, is_transfer: false },
        { date: '2025-12-22', amount: 7834.30, is_transfer: true },
      ],
      '2026-01-01',
      0,
    )).toBe(18574.44);
  });
});

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

describe('computeMonthlyPreviousBalance', () => {
  const accounts = [{ id: 'bank', opening_balance: 1000, opening_balance_date: '2025-01-01' }];
  const transactions = [
    { account_id: 'bank', date: '2025-01-10', amount: 300, is_transfer: false },
    { account_id: 'bank', date: '2025-02-10', amount: -100, is_transfer: false },
    { account_id: 'bank', date: '2025-02-15', amount: -500, is_transfer: true },
    { account_id: 'bank', date: '2025-12-10', amount: 50, is_transfer: false },
  ];

  it('uses January bank balance as the implicit yearly starting point', () => {
    expect(computeMonthlyPreviousBalance(accounts, transactions, [], 2025, 1).displayed).toBe(1000);
    expect(computeMonthlyPreviousBalance(accounts, transactions, [], 2025, 3).displayed).toBe(1200);
  });

  it('chains across the year boundary and ignores transfers after a manual anchor', () => {
    const result = computeMonthlyPreviousBalance(accounts, transactions, [anchor(2025, 1, 2000)], 2026, 1);
    expect(result.displayed).toBe(2250);
  });

  it('uses a saved value in its own month and preserves the calculated restoration value', () => {
    const result = computeMonthlyPreviousBalance(
      accounts,
      transactions,
      [anchor(2025, 3, 5000), anchor(2025, 1, 2000)],
      2025,
      3,
    );
    expect(result).toEqual({ calculated: 2200, displayed: 5000, hasSavedValue: true });
  });
});

describe('computeMonthlyClosing', () => {
  it('keeps total geral equal to subtotal when investment balances are zero', () => {
    expect(computeMonthlyClosing(1000, 500, 200, [0, 0])).toEqual({
      subtotal: 1300,
      totalApplied: 0,
      totalGeral: 1300,
    });
  });

  it('adds every investment account balance to the subtotal', () => {
    expect(computeMonthlyClosing(1000, 500, 200, [125.55, 74.45])).toEqual({
      subtotal: 1300,
      totalApplied: 200,
      totalGeral: 1500,
    });
  });

  it('adds one investment account balance to the subtotal', () => {
    expect(computeMonthlyClosing(800, 300, 100, [250])).toEqual({
      subtotal: 1000,
      totalApplied: 250,
      totalGeral: 1250,
    });
  });
});