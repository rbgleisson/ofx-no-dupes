import { Transaction } from '@/lib/transactionStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import { ChartAccount } from '@/components/ChartAccountsManager';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ArrowDownLeft, ArrowUpRight, FileText, Paperclip, Calendar, Tag, Wallet, BookOpen, Hash, MessageSquare, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

interface TransactionDetailSheetProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
  categories: Category[];
  accounts: Account[];
  chartAccounts: ChartAccount[];
  onEdit: (tx: Transaction) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (date: string) => {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
};

const TransactionDetailSheet = ({
  transaction,
  open,
  onClose,
  categories,
  accounts,
  chartAccounts,
  onEdit,
}: TransactionDetailSheetProps) => {
  if (!transaction) return null;

  const amt = Number(transaction.amount);
  const isCredit = amt >= 0;
  const cat = categories.find(c => c.id === transaction.category_id);
  const acc = accounts.find(a => a.id === transaction.account_id);
  const ca = chartAccounts.find(c => c.id === (transaction as any).chart_account_id);

  // Extract NF-e key from memo if present
  const nfeMatch = transaction.memo?.match(/NF-e:\s*(\d{44})/);
  const nfeKey = nfeMatch ? nfeMatch[1] : null;
  const memoWithoutNfe = transaction.memo?.replace(/\s*\|?\s*NF-e:\s*\d{44}/, '').trim();

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">Detalhes do Lançamento</SheetTitle>
        </SheetHeader>

        {/* Amount hero */}
        <div className={`rounded-xl p-5 mb-6 ${isCredit ? 'bg-[hsl(var(--success))]/10' : 'bg-destructive/10'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`rounded-lg p-2 ${isCredit ? 'bg-[hsl(var(--success))]/20' : 'bg-destructive/20'}`}>
              {isCredit ? (
                <ArrowDownLeft className="w-5 h-5 text-[hsl(var(--success))]" />
              ) : (
                <ArrowUpRight className="w-5 h-5 text-destructive" />
              )}
            </div>
            <Badge variant={isCredit ? 'default' : 'destructive'} className="text-xs">
              {isCredit ? 'Entrada' : 'Saída'}
            </Badge>
          </div>
          <p className={`text-2xl font-bold font-mono ${isCredit ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
            {formatCurrency(amt)}
          </p>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <DetailRow icon={<Calendar className="w-4 h-4" />} label="Data" value={formatDate(transaction.date)} />

          <DetailRow
            icon={<FileText className="w-4 h-4" />}
            label="Descrição"
            value={transaction.description}
          />

          {memoWithoutNfe && (
            <DetailRow
              icon={<MessageSquare className="w-4 h-4" />}
              label="Memo"
              value={memoWithoutNfe}
            />
          )}

          <Separator />

          <DetailRow
            icon={<Tag className="w-4 h-4" />}
            label="Categoria"
            value={
              cat ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Sem categoria</span>
              )
            }
          />

          <DetailRow
            icon={<Wallet className="w-4 h-4" />}
            label="Conta"
            value={
              acc ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: acc.color }} />
                  {acc.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Sem conta</span>
              )
            }
          />

          <DetailRow
            icon={<BookOpen className="w-4 h-4" />}
            label="Conta Contábil"
            value={
              ca ? (
                <span><span className="font-mono text-muted-foreground">{ca.code}</span> {ca.name}</span>
              ) : (
                <span className="text-muted-foreground">Sem conta contábil</span>
              )
            }
          />

          {transaction.fit_id && (
            <>
              <Separator />
              <DetailRow
                icon={<Hash className="w-4 h-4" />}
                label="FIT ID"
                value={<span className="font-mono text-xs break-all">{transaction.fit_id}</span>}
              />
            </>
          )}

          {nfeKey && (
            <>
              <Separator />
              <DetailRow
                icon={<Hash className="w-4 h-4" />}
                label="Chave NF-e"
                value={<span className="font-mono text-xs break-all">{nfeKey}</span>}
              />
            </>
          )}

          {/* Attachment */}
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Paperclip className="w-4 h-4" />
              Anexo
            </p>
            {transaction.attachment_url ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                {/\.(jpg|jpeg|png|webp)$/i.test(transaction.attachment_url) ? (
                  <img
                    src={transaction.attachment_url}
                    alt="Anexo"
                    className="w-full rounded-md object-contain max-h-64"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">Documento anexado</p>
                      <p className="text-xs text-muted-foreground">PDF / Documento</p>
                    </div>
                  </div>
                )}
                <a
                  href={transaction.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir anexo
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum anexo vinculado</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 pt-4 border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onEdit(transaction);
              onClose();
            }}
          >
            Editar lançamento
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <div className="text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

export default TransactionDetailSheet;
