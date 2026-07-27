import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import AccountBalanceCards from './AccountBalanceCards';
import type { Account } from './AccountsManager';
import type { Transaction } from '@/lib/transactionStore';
import type { Installment } from '@/lib/installmentStore';

interface AccountBalancesSheetProps {
  accounts: Account[];
  transactions: Transaction[];
  installments: Installment[];
  trigger?: React.ReactNode;
  onOpen?: () => void;
}

export default function AccountBalancesSheet({
  accounts,
  transactions,
  installments,
  trigger,
  onOpen,
}: AccountBalancesSheetProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && onOpen) onOpen();
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
          <AccountBalanceCards
            accounts={accounts}
            transactions={transactions}
            installments={installments}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
