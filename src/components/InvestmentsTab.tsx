import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Wallet, AlertTriangle } from 'lucide-react';
import { Transaction } from '@/lib/transactionStore';
import { Account } from './AccountsManager';
import { Installment } from '@/lib/installmentStore';
import { computeAccountBalances, round2 } from '@/lib/accountBalances';

interface Props {
  transactions: Transaction[];
  accounts: Account[];
  installments?: Installment[];
}

const APLICACAO_KEYWORDS = ['APLIC', 'INVEST'];
const RESGATE_KEYWORDS = ['RESGATE', 'CRED.TRANSF', 'CRED TRANSF'];

function classify(desc: string): 'aplicacao' | 'resgate' | 'outro' {
  const u = (desc || '').toUpperCase();
  if (APLICACAO_KEYWORDS.some(k => u.includes(k))) return 'aplicacao';
  if (RESGATE_KEYWORDS.some(k => u.includes(k))) return 'resgate';
  return 'outro';
}

export default function InvestmentsTab({ transactions, accounts, installments = [] }: Props) {
  const { balances: positionBalances } = useInvestmentPositions();
  const investmentAccounts = useMemo(() => accounts.filter(isInvestmentAccount), [accounts]);
  const investmentAccountIds = useMemo(
    () => new Set(investmentAccounts.map(a => a.id)),
    [investmentAccounts]
  );

  // Saldo de cada aplicação: última posição mensal informada (fallback: transações).
  const balances = useMemo(
    () => computeAccountBalances(investmentAccounts, transactions, installments, positionBalances),
    [investmentAccounts, transactions, installments, positionBalances]
  );
  const totalBalance = round2(balances.reduce((s, b) => s + b.realized, 0));


  // Movimentações efetivamente vinculadas às contas de aplicação.
  const linked = useMemo(
    () => transactions
      .filter(t => t.account_id && investmentAccountIds.has(t.account_id))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [transactions, investmentAccountIds]
  );

  // Lista secundária: possíveis aplicações/resgates NÃO vinculados à conta oficial.
  const unlinked = useMemo(
    () => transactions
      .filter(t => !(t.account_id && investmentAccountIds.has(t.account_id)) && classify(t.description) !== 'outro')
      .sort((a, b) => a.date.localeCompare(b.date)),
    [transactions, investmentAccountIds]
  );

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string) => {
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  };

  const renderTable = (rows: Transaction[]) => (
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
          {rows.map(t => {
            const acc = accounts.find(a => a.id === t.account_id);
            const isOut = Number(t.amount) < 0;
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
  );

  return (
    <div className="space-y-4">
      {investmentAccounts.length === 0 ? (
        <div className="rounded-xl border p-4 bg-muted/30">
          <p className="text-sm font-medium">Nenhuma conta de aplicação cadastrada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre uma conta "Aplicação Financeira" e registre as aplicações/resgates como Transferência
            para acompanhar o saldo aplicado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border p-4 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              <Wallet className="w-3.5 h-3.5 inline mr-1" />
              Saldo Total Aplicado
            </p>
            <p className={`text-lg font-bold ${totalBalance >= 0 ? 'text-cyan-600' : 'text-orange-600'}`}>
              {fmt(totalBalance)}
            </p>
          </div>
          {balances.map(b => (
            <div key={b.account.id} className="rounded-xl border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">{b.account.name}</p>
              <p className="text-lg font-bold">{fmt(b.realized)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                <TrendingDown className="w-3 h-3 inline mr-0.5 text-red-500" />
                Aplicado {fmt(b.income)}
                {' · '}
                <TrendingUp className="w-3 h-3 inline mr-0.5 text-emerald-500" />
                Resgatado {fmt(b.expense)}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        O saldo acima é o saldo real das contas de aplicação (mesmo cálculo do cadastro de contas).
        Estas movimentações não afetam o saldo de entradas/saídas reais.
      </p>

      {linked.length > 0 && renderTable(linked)}

      {unlinked.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs leading-snug">
              Possíveis movimentações de aplicação <strong>não vinculadas à conta oficial</strong> (identificadas pela descrição).
              Revise e, se for o caso, reclassifique manualmente como Transferência. Elas não entram no saldo acima.
            </p>
          </div>
          {renderTable(unlinked)}
        </div>
      )}

      {investmentAccounts.length > 0 && linked.length === 0 && unlinked.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Nenhuma movimentação de investimento encontrada no período filtrado.
        </div>
      )}
    </div>
  );
}
