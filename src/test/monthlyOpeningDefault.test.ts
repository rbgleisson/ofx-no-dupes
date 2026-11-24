import { describe, expect, it } from 'vitest';
import { resolveMonthlyOpeningBalance, type MonthlyOpeningAnchor } from '@/lib/monthlyOpeningBalance';
import { computeBankReconciliation } from '@/lib/bankReconciliation';

const accounts = [
  { id: 'banco', name: 'Banco', kind: 'checking', opening_balance: 1000, opening_balance_date: '2026-01-01' },
  { id: 'caixa', name: 'CAIXA', kind: 'cash', opening_balance: 200, opening_balance_date: '2026-01-01' },
  { id: 'inv', name: 'Aplicação', kind: 'investment', opening_balance: 5000, opening_balance_date: '2026-01-01' },
];
const txs = [
  { account_id: 'banco', date: '2026-01-10', amount: 300, is_transfer: false },
  { account_id: 'banco', date: '2026-01-20', amount: -400, is_transfer: true }, // aplicação
  { account_id: 'caixa', date: '2026-01-15', amount: -50, is_transfer: false },
  { account_id: 'inv', date: '2026-01-20', amount: 400, is_transfer: true },
];
const saved: MonthlyOpeningAnchor = { id: 'a', organization_id: 'o', year: 2026, month: 2, amount: 9999.99 };

describe('Saldo Anterior padrão', () => {
  it('usa o valor salvo quando existe', () => {
    const r = resolveMonthlyOpeningBalance(accounts, [], txs, [saved], 2026, 2);
    expect(r.displayed).toBe(9999.99);
    expect(r.hasSavedValue).toBe(true);
    expect(r.calculated).toBe(1050);
  });
  it('sem valor salvo usa o saldo dos bancos no fim do mês anterior, sem aplicações', () => {
    const r = resolveMonthlyOpeningBalance(accounts, [], txs, [], 2026, 2);
    // banco 1000+300-400 = 900; caixa 200-50 = 150; investimento ignorado
    expect(r.displayed).toBe(1050);
    expect(r.hasSavedValue).toBe(false);
  });
  it('é igual ao "Saldo bancário anterior" e igual para tela e Resumo', () => {
    const bank = computeBankReconciliation(accounts, [], txs, '2026-02-01', '2026-03-01').previous;
    const screen = resolveMonthlyOpeningBalance(accounts, [], txs, [], 2026, 2);
    const summary = resolveMonthlyOpeningBalance(accounts, [], [...txs], [], 2026, 2);
    expect(screen.displayed).toBe(bank);
    expect(summary.displayed).toBe(screen.displayed);
  });
});
