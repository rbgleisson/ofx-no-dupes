import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Wallet, Loader2 } from 'lucide-react';
import AccountBalanceCards from './AccountBalanceCards';
import MonthlyBalancesTable from './MonthlyBalancesTable';
import OpeningBalancesEditor from './OpeningBalancesEditor';
import type { Account } from './AccountsManager';
import { fetchTransactions, type Transaction } from '@/lib/transactionStore';
import type { Installment } from '@/lib/installmentStore';
import { useOrganization } from '@/hooks/useOrganization';

interface AccountBalancesSheetProps {
  accounts: Account[];
  transactions: Transaction[];
  installments: Installment[];
  trigger?: React.ReactNode;
  onOpen?: () => void;
  onAccountsChange?: () => void;
}


export default function AccountBalancesSheet({
  accounts,
  transactions,
  installments,
  trigger,
  onOpen,
}: AccountBalancesSheetProps) {
  const [open, setOpen] = useState(false);
  const [allTx, setAllTx] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { organizationId } = useOrganization();

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next && onOpen) onOpen();
    if (next) {
      setLoading(true);
      try {
        const data = await fetchTransactions(undefined, organizationId);
        setAllTx(data);
      } catch {
        setAllTx(null);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" className="border-primary/30 text-primary">
            <Wallet className="w-4 h-4 mr-1.5" />
            Saldo de Contas
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Saldo de Contas</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculando saldos com todo o histórico...
            </div>
          )}
          <AccountBalanceCards
            accounts={accounts}
            transactions={allTx ?? transactions}
            installments={installments}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

