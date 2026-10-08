import { useState } from 'react';
import { ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { round2 } from '@/lib/accountBalances';
import type { computeBankReconciliation } from '@/lib/bankReconciliation';

export type BankReconciliationResult = ReturnType<typeof computeBankReconciliation>;
const fmt = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function BankReconciliation({ data, loading, error, previousBalance, realMovement, subtotal }: {
  data: BankReconciliationResult | null;
  loading: boolean;
  error: boolean;
  previousBalance: number;
  realMovement: number;
  subtotal: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const openingDifference = data ? round2(data.previous - previousBalance) : 0;
  const movementDifference = data ? round2(data.realMovement - realMovement) : 0;
  return (
    <section aria-label="Conferência dos saldos bancários" className="border-y border-border py-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2"><Wallet className="h-4 w-4 text-muted-foreground" />Saldo disponível nos bancos</h3>
          <p className="text-2xl font-bold tabular-nums mt-1" role="status">{loading ? 'Conferindo…' : error ? 'Conferência indisponível' : data ? fmt(data.final) : '—'}</p>
        </div>
        <Button variant="ghost" size="sm" disabled={loading || !data || error} onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
          Conferir por conta {expanded ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
        </Button>
      </div>
      {!loading && !error && data && (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm">
            <div className="flex justify-between gap-3"><dt>Sub total</dt><dd className="font-semibold tabular-nums">{fmt(subtotal)}</dd></div>
            {openingDifference !== 0 && <div className="flex justify-between gap-3"><dt>Diferença entre saldos iniciais</dt><dd className="font-semibold tabular-nums">{fmt(openingDifference)}</dd></div>}
            {movementDifference !== 0 && <div className="flex justify-between gap-3"><dt>Movimentações reais fora dos bancos</dt><dd className="font-semibold tabular-nums">{fmt(movementDifference)}</dd></div>}
            <div className="flex justify-between gap-3"><dt>Aplicações, resgates e transferências internas (líquido)</dt><dd className="font-semibold tabular-nums shrink-0">{fmt(data.internalMovement)}</dd></div>
            {data.anchorDifference !== 0 && <div className="flex justify-between gap-3"><dt>Diferença reconhecida nos extratos registrados</dt><dd className="font-semibold tabular-nums">{fmt(data.anchorDifference)}</dd></div>}
          </dl>
          {expanded && <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-muted-foreground border-b border-border"><tr>{['Conta', 'Saldo anterior', 'Créditos', 'Débitos', 'Saldo disponível', 'Extrato do mês'].map(label => <th key={label} className="py-2 px-3 font-medium">{label}</th>)}</tr></thead>
              <tbody>{data.rows.map(row => <tr key={row.id} className="border-b border-border">
                <td className="py-3 px-3">{row.name}</td>
                <td className="py-3 px-3 tabular-nums">{fmt(row.previous)}</td>
                <td className="py-3 px-3 tabular-nums">{fmt(row.credits)}</td>
                <td className="py-3 px-3 tabular-nums">{fmt(row.debits)}</td>
                <td className="py-3 px-3 font-semibold tabular-nums">{fmt(row.final)}</td>
                <td className="py-3 px-3">{row.statement ? <><span>{row.statement.balance_date.split('-').reverse().join('/')} · {fmt(row.statement.balance)}</span><br /><span className={row.statementDiff === 0 ? 'text-muted-foreground' : 'text-destructive'}>{row.statementDiff === 0 ? 'Confere' : `Diferença nos lançamentos: ${fmt(row.statementDiff ?? 0)}`}</span></> : row.hasAnchor ? 'Sem extrato no mês' : 'Sem extrato registrado'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </>
      )}
    </section>
  );
}