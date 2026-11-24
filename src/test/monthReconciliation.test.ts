import { describe, it, expect } from 'vitest';
import { buildMonthReconciliation } from '@/lib/monthReconciliation';
import { computeBankReconciliation } from '@/lib/bankReconciliation';

describe('conciliação completa do mês', () => {
  const accounts = [{ id: 'b', name: 'Banco', opening_balance: 1000, opening_balance_date: '2026-01-01' }];
  const txs = [
    { account_id: 'b', date: '2026-02-05', amount: 500, is_transfer: false },
    { account_id: 'b', date: '2026-02-06', amount: -200, is_transfer: false },
    { account_id: 'b', date: '2026-02-10', amount: 3000, is_transfer: true }, // resgate
    { account_id: 'b', date: '2026-02-11', amount: -1000, is_transfer: true }, // aplicação
  ];
  const bank = computeBankReconciliation(accounts, [], txs, '2026-02-01', '2026-03-01');

  it('linhas somam exatamente o saldo disponível nos bancos', () => {
    const r = buildMonthReconciliation(900, 500, 200, bank, [4000]);
    expect(r.monthResult).toBe(300);
    expect(r.internalNet).toBe(2000);
    expect(r.otherDifferences).toBe(100); // saldo anterior 900 vs banco 1000
    expect(r.bankFinal).toBe(3300);
    expect(Math.round((r.previousBalance + r.monthResult + r.internalNet + r.otherDifferences) * 100) / 100).toBe(r.bankFinal);
  });

  it('Total com aplicações = saldo disponível + aplicações (inclui resgates)', () => {
    const r = buildMonthReconciliation(1000, 500, 200, bank, [4000, 250.5]);
    expect(r.otherDifferences).toBe(0);
    expect(r.totalWithInvestments).toBe(3300 + 4250.5);
  });
});
