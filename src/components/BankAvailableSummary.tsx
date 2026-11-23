import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Wallet } from 'lucide-react';
import type { Account } from '@/components/AccountsManager';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { fetchStatementBalances } from '@/lib/statementBalances';
import { computeBankReconciliation } from '@/lib/bankReconciliation';
import { round2 } from '@/lib/accountBalances';

interface Props {
  accounts: Account[];
  organizationId: string | null;
  year?: number;
  month?: number;
  subtotal: number;
  refreshKey: unknown;
}
const fmt = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function BankAvailableSummary({ accounts, organizationId, year, month, subtotal, refreshKey }: Props) {
  const [result, setResult] = useState<ReturnType<typeof computeBankReconciliation> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(false);
    if (!organizationId || !year) { setLoading(false); return; }
    setLoading(true);
    const start = `${year}-${String(month ?? 1).padStart(2, '0')}-01`;
    const endYear = !month || month === 12 ? year + 1 : year;
    const endMonth = !month || month === 12 ? 1 : month + 1;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    void Promise.all([
      fetchAllRows<{ id: string; account_id: string | null; date: string; amount: number; is_transfer: boolean }>(() =>
        supabase.from('transactions').select('id, account_id, date, amount, is_transfer')
          .eq('organization_id', organizationId).not('account_id', 'is', null).lt('date', end)),
      fetchStatementBalances(organizationId),
    ]).then(([txs, statements]) => {
      if (!cancelled) setResult(computeBankReconciliation(accounts, statements, txs, start, end));
    }).catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accounts, organizationId, year, month, refreshKey]);

  return (
    <section className="border-y border-border py-4 mb-6" aria-label="Fechamento bancário">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />Saldo disponível nos bancos</h2>
          {loading ? <Loader2 className="h-5 w-5 animate-spin mt-2" aria-label="Calculando saldo bancário" /> :
            error ? <p className="text-sm text-destructive mt-2">Não foi possível conferir os saldos bancários.</p> :
            result ? <p className="text-2xl font-bold mt-1 tabular-nums" data-testid="bank-available-total">{fmt(result.final)}</p> :
            <p className="text-sm text-muted-foreground mt-2">Selecione um ano.</p>}
        </div>
        {result && <Button variant="outline" size="sm" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
          Conferir por conta<ChevronDown className={`ml-2 h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </Button>}
      </div>
      {result && <p className="text-sm text-muted-foreground mt-2">Diferença em relação ao Saldo do mês: <span className="font-semibold text-foreground">{fmt(round2(result.final - subtotal))}</span></p>}
      {expanded && result && <div className="mt-4">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
          <div><dt className="text-muted-foreground">Saldo bancário anterior</dt><dd className="font-semibold tabular-nums">{fmt(result.previous)}</dd></div>
          <div><dt className="text-muted-foreground">Aplicações, resgates e transferências (líquido)</dt><dd className="font-semibold tabular-nums">{fmt(result.internalNet)}</dd></div>
          <div><dt className="text-muted-foreground">Diferença entre extratos e lançamentos</dt><dd className={result.statementDifference === 0 ? 'font-semibold text-foreground' : 'font-semibold text-destructive'}>{fmt(result.statementDifference)}</dd></div>
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-muted-foreground border-b border-border"><tr>
              {['Conta', 'Saldo anterior', 'Entradas − saídas reais', 'Internas (líquido)', 'Diferença de extrato', 'Saldo final', 'Último extrato'].map(label => <th key={label} className="py-2 px-3 font-medium whitespace-nowrap">{label}</th>)}
            </tr></thead>
            <tbody>{result.rows.map(row => <tr key={row.id} className="border-b border-border">
              <td className="py-3 px-3 whitespace-nowrap font-medium">{row.name}</td>
              {[row.previous, row.realNet, row.internalNet, row.statementDifference, row.final].map((value, index) => <td key={index} className={`py-3 px-3 whitespace-nowrap tabular-nums ${index === 4 ? 'font-bold' : ''} ${index === 3 && value !== 0 ? 'text-destructive' : ''}`}>{fmt(value)}</td>)}
              <td className="py-3 px-3 whitespace-nowrap text-muted-foreground">{row.anchorDate ? row.anchorDate.split('-').reverse().join('/') : 'Sem extrato · saldo de abertura'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
    </section>
  );
}