import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import type { Account } from './AccountsManager';
import type { Transaction } from '@/lib/transactionStore';
import type { Installment } from '@/lib/installmentStore';
import { computeAccountBalances } from '@/lib/accountBalances';
import { useInvestmentPositions } from '@/hooks/useInvestmentPositions';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  installments: Installment[];
}

const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AccountBalanceCards({ accounts, transactions, installments }: Props) {
  const { balances: positionBalances } = useInvestmentPositions();
  if (!accounts.length) return null;
  const balances = computeAccountBalances(accounts, transactions, installments, positionBalances);
  const total = balances.reduce((s, b) => s + b.realized, 0);
  const totalProj = balances.reduce((s, b) => s + b.projected, 0);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldo por conta</p>
        <div className="text-xs text-muted-foreground">
          Total realizado: <span className={`font-semibold ${total < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(total)}</span>
          <span className="mx-2">·</span>
          Projetado: <span className={`font-semibold ${totalProj < 0 ? 'text-red-500' : 'text-blue-600'}`}>{fmt(totalProj)}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {balances.map(({ account, opening, realized, projected, pendingIn, pendingOut }) => (
          <div key={account.id} className="rounded-xl border p-3 bg-card">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: account.color }} />
              <span className="text-sm font-medium truncate flex-1" title={account.name}>{account.name}</span>
              <Wallet className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] uppercase text-muted-foreground">Realizado</span>
              <span className={`text-base font-bold ${realized < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(realized)}</span>
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-[10px] uppercase text-muted-foreground">Projetado</span>
              <span className={`text-xs font-semibold ${projected < 0 ? 'text-red-500' : 'text-blue-600'}`}>{fmt(projected)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                Inicial: {fmt(opening)}
                {account.opening_balance_date ? ` (desde ${String(account.opening_balance_date).slice(0,10).split('-').reverse().join('/')})` : ''}
              </span>

              <span className="flex items-center gap-2">
                <span className="flex items-center gap-0.5 text-emerald-600"><TrendingUp className="w-3 h-3" />{fmt(pendingIn)}</span>
                <span className="flex items-center gap-0.5 text-red-500"><TrendingDown className="w-3 h-3" />{fmt(pendingOut)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
