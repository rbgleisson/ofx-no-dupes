import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Transaction } from '@/lib/transactionStore';
import { Account } from './AccountsManager';

interface Props {
  transactions: Transaction[];
  accounts: Account[];
}

const APLICACAO_KEYWORDS = ['APLIC', 'INVEST'];
const RESGATE_KEYWORDS = ['RESGATE', 'CRED.TRANSF', 'CRED TRANSF'];

function classify(desc: string): 'aplicacao' | 'resgate' | 'outro' {
  const u = (desc || '').toUpperCase();
  if (APLICACAO_KEYWORDS.some(k => u.includes(k))) return 'aplicacao';
  if (RESGATE_KEYWORDS.some(k => u.includes(k))) return 'resgate';
  return 'outro';
}

export default function InvestmentsTab({ transactions, accounts }: Props) {
  const investmentAccountIds = useMemo(
    () => new Set(
      accounts
        .filter(a => (a.kind || '').toLowerCase() === 'investment' || /aplica/i.test(a.name || ''))
        .map(a => a.id)
    ),
    [accounts]
  );

  const investments = useMemo(() => {
    return transactions
      .filter(t => {
        // Movimentações que tocam uma conta de aplicação sempre entram
        if (t.account_id && investmentAccountIds.has(t.account_id)) return true;
        // Caso contrário, só entra se a descrição indicar aplicação/resgate.
        // Transferências internas comuns (Pix entre contas) NÃO são investimentos.
        return classify(t.description) !== 'outro';
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, investmentAccountIds]);


  const totals = useMemo(() => {
    let aplicado = 0;
    let resgatado = 0;
    investments.forEach(t => {
      const amt = Number(t.amount);
      const kind = classify(t.description);
      if (amt < 0 || kind === 'aplicacao') aplicado += Math.abs(amt);
      else resgatado += amt;
    });
    return { aplicado, resgatado, posicao: aplicado - resgatado };
  }, [investments]);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string) => {
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            <TrendingDown className="w-3.5 h-3.5 inline mr-1" />
            Total Aplicado (saídas p/ investimento)
          </p>
          <p className="text-lg font-bold text-red-600">{fmt(totals.aplicado)}</p>
        </div>
        <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
            Total Resgatado (entradas de investimento)
          </p>
          <p className="text-lg font-bold text-emerald-600">{fmt(totals.resgatado)}</p>
        </div>
        <div className="rounded-xl border p-4 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            <Wallet className="w-3.5 h-3.5 inline mr-1" />
            Posição Aplicada (aplicado − resgatado)
          </p>
          <p className={`text-lg font-bold ${totals.posicao >= 0 ? 'text-cyan-600' : 'text-orange-600'}`}>
            {fmt(totals.posicao)}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Mostra movimentações classificadas como transferência interna ou com descrição de aplicação/resgate.
        Estas movimentações não afetam o saldo de entradas/saídas reais.
      </p>

      {investments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma movimentação de investimento encontrada no período filtrado.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investments.map(t => {
                const acc = accounts.find(a => a.id === t.account_id);
                const kind = classify(t.description);
                const isOut = Number(t.amount) < 0 || kind === 'aplicacao';
                return (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{acc?.name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isOut ? 'border-red-400 text-red-600' : 'border-emerald-400 text-emerald-600'}>
                        {isOut ? 'Aplicação' : 'Resgate'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${isOut ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmt(Number(t.amount))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
