import { describe, expect, it } from 'vitest';
import { splitMonthCashflow } from '@/lib/monthComposition';

const rows = [
  { date: '2026-03-02', amount: 1000, account_id: 'a' },
  { date: '2026-03-03', amount: 250.5, account_id: 'a' },
  { date: '2026-03-04', amount: -400, account_id: 'b' },
  { date: '2026-03-05', amount: -5000, account_id: 'a', is_transfer: true },
  { date: '2026-03-06', amount: 160, account_id: null },
  { date: '2026-03-07', amount: -100, account_id: null },
];

describe('splitMonthCashflow', () => {
  it('soma Entradas e Saídas só de lançamentos com conta e sem transferência', () => {
    const r = splitMonthCashflow(rows);
    expect(r.entries).toBe(1250.5);
    expect(r.exits).toBe(400);
    expect(r.entriesCount).toBe(2);
    expect(r.exitsCount).toBe(1);
  });
  it('conta à parte transferências e lançamentos sem conta', () => {
    const r = splitMonthCashflow(rows);
    expect(r.transfers).toMatchObject({ count: 1, sum: -5000 });
    expect(r.noAccount).toMatchObject({ count: 2, sum: 60 });
  });
});
