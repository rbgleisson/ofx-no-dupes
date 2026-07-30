import { useMemo, useState } from 'react';
import { computeMonthlySeries } from '@/lib/accountBalances';
import type { Account } from './AccountsManager';
import type { Transaction } from '@/lib/transactionStore';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
}

const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const label = (m: string) => {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1] ?? mm}/${y}`;
};

export default function MonthlyBalancesTable({ accounts, transactions }: Props) {
  const [accountId, setAccountId] = useState<string>('all');
  const rows = useMemo(
    () => computeMonthlySeries(accounts, transactions, accountId),
    [accounts, transactions, accountId]
  );

  const opening = useMemo(() => {
    const sel = accountId === 'all' ? accounts : accounts.filter(a => a.id === accountId);
    return sel.reduce((s, a) => s + Number(a.opening_balance ?? 0), 0);
  }, [accounts, accountId]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saldos mês a mês</p>
        <div className="w-56">
          <Label className="sr-only">Conta</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Mês</th>
              <th className="text-right px-3 py-2 font-medium">Entradas</th>
              <th className="text-right px-3 py-2 font-medium">Saídas</th>
              <th className="text-right px-3 py-2 font-medium">Resultado</th>
              <th className="text-right px-3 py-2 font-medium">Saldo acumulado</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t bg-muted/20">
              <td className="px-3 py-2 font-medium">Saldo inicial</td>
              <td colSpan={3} />
              <td className="px-3 py-2 text-right font-semibold">{fmt(opening)}</td>
            </tr>
            {rows.map(r => (
              <tr key={r.month} className="border-t">
                <td className="px-3 py-2">{label(r.month)}</td>
                <td className="px-3 py-2 text-right text-emerald-600">{fmt(r.income)}</td>
                <td className="px-3 py-2 text-right text-red-500">{fmt(r.expense)}</td>
                <td className={`px-3 py-2 text-right ${r.net < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(r.net)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${r.cumulative < 0 ? 'text-red-500' : 'text-foreground'}`}>{fmt(r.cumulative)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="border-t">
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  Nenhum lançamento no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
