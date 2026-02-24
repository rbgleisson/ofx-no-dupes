import { OFXTransaction } from '@/lib/ofxParser';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface TransactionTableProps {
  transactions: OFXTransaction[];
}

const TransactionTable = ({ transactions }: TransactionTableProps) => {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const credits = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const debits = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string) => {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border p-4">
          <p className="text-sm text-muted-foreground font-medium">Entradas</p>
          <p className="text-xl font-bold text-[hsl(var(--success))] mt-1 font-mono">{formatCurrency(credits)}</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <p className="text-sm text-muted-foreground font-medium">Saídas</p>
          <p className="text-xl font-bold text-destructive mt-1 font-mono">{formatCurrency(debits)}</p>
        </div>
        <div className="rounded-xl bg-card border p-4">
          <p className="text-sm text-muted-foreground font-medium">Saldo</p>
          <p className={`text-xl font-bold mt-1 font-mono ${total >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Data</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Descrição</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tx, i) => (
                <tr key={tx.id + i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground whitespace-nowrap">
                    {formatDate(tx.date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-1.5 ${tx.amount >= 0 ? 'bg-[hsl(var(--success))]/10' : 'bg-destructive/10'}`}>
                        {tx.amount >= 0 ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-destructive" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{tx.description}</p>
                        {tx.memo && <p className="text-xs text-muted-foreground mt-0.5">{tx.memo}</p>}
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-sm font-mono font-semibold text-right whitespace-nowrap ${
                    tx.amount >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'
                  }`}>
                    {formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TransactionTable;
