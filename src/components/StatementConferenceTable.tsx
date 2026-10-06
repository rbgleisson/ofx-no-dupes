import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { computeAnchoredBalance, fetchStatementBalances } from '@/lib/statementBalances';
import type { Account } from './AccountsManager';

interface Row { key: string; account: string; date: string; statement: number; calculated: number; diff: number; source: string }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function StatementConferenceTable({ accounts, organizationId }: { accounts: Account[]; organizationId: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      try {
        const [statements, txs] = await Promise.all([
          fetchStatementBalances(organizationId),
          fetchAllRows<{ id: string; date: string; amount: number; account_id: string }>(() =>
            supabase.from('transactions').select('id, date, amount, account_id')
              .eq('organization_id', organizationId).not('account_id', 'is', null) as any),
        ]);
        const out: Row[] = [];
        for (const s of statements) {
          const acc = accounts.find(a => a.id === s.account_id);
          if (!acc) continue;
          const accTx = txs.filter(t => t.account_id === acc.id);
          const calc = computeAnchoredBalance(acc, statements, accTx, s.balance_date, true).balance;
          out.push({
            key: s.id || `${s.account_id}-${s.balance_date}`,
            account: acc.name, date: s.balance_date, statement: s.balance, calculated: calc,
            diff: Math.round((calc - s.balance + Number.EPSILON) * 100) / 100, source: s.source,
          });
        }
        out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        setRows(out);
      } catch (e) {
        console.error(e);
        setRows([]);
      }
    })();
  }, [accounts, organizationId]);

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conferência com o extrato</p>
      {rows === null ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum saldo de extrato registrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Conta</th>
                <th className="text-left p-2">Data</th>
                <th className="text-right p-2">Saldo do extrato</th>
                <th className="text-right p-2">Saldo calculado</th>
                <th className="text-right p-2">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-t">
                  <td className="p-2">{r.account}{r.source === 'manual' ? ' (manual)' : ''}</td>
                  <td className="p-2">{r.date.split('-').reverse().join('/')}</td>
                  <td className="p-2 text-right">{fmt(r.statement)}</td>
                  <td className="p-2 text-right">{fmt(r.calculated)}</td>
                  <td className={`p-2 text-right font-semibold ${r.diff === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.diff === 0 ? 'Confere' : fmt(r.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
