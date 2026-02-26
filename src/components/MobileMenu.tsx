import { Menu, Plus, Trash2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useState } from 'react';

interface MobileMenuProps {
  onNewTransaction: () => void;
  onClear: () => void;
  onLogout: () => void;
  showClear: boolean;
  accountsManager: React.ReactNode;
  categoriesManager: React.ReactNode;
  chartAccountsManager: React.ReactNode;
}

const MobileMenu = ({
  onNewTransaction,
  onClear,
  onLogout,
  showClear,
  accountsManager,
  categoriesManager,
  chartAccountsManager,
}: MobileMenuProps) => {
  const [open, setOpen] = useState(false);

  const handleAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 mt-6">
          <Button
            onClick={() => handleAction(onNewTransaction)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 justify-start"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Lançamento
          </Button>
          <div className="border-t my-2" />

          <div onClick={() => setOpen(false)} className="[&>button]:w-full [&>button]:justify-start">{accountsManager}</div>
          <div onClick={() => setOpen(false)} className="[&>button]:w-full [&>button]:justify-start">{categoriesManager}</div>
          <div onClick={() => setOpen(false)} className="[&>button]:w-full [&>button]:justify-start">{chartAccountsManager}</div>

          {showClear && (
            <>
              <div className="border-t my-2" />
              <Button
                variant="outline"
                onClick={() => handleAction(onClear)}
                className="text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20 justify-start"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar Tudo
              </Button>
            </>
          )}

          <div className="border-t my-2" />
          <Button
            variant="ghost"
            onClick={() => handleAction(onLogout)}
            className="text-muted-foreground hover:text-destructive justify-start"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
