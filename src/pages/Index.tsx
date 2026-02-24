import { useState, useEffect } from 'react';
import { parseOFX, OFXTransaction } from '@/lib/ofxParser';
import { getStoredTransactions, importTransactions, clearTransactions, ImportResult } from '@/lib/transactionStore';
import { clearAllAttachments } from '@/lib/attachmentStore';
import FileDropzone from '@/components/FileDropzone';
import TransactionTable from '@/components/TransactionTable';
import { Trash2, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [transactions, setTransactions] = useState<OFXTransaction[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);

  useEffect(() => {
    setTransactions(getStoredTransactions());
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleFileSelect = (content: string, fileName: string) => {
    try {
      const data = parseOFX(content);

      if (data.transactions.length === 0) {
        setNotification({ type: 'warning', message: 'Nenhuma transação encontrada no arquivo.' });
        return;
      }

      const result: ImportResult = importTransactions(data.transactions);
      setTransactions(getStoredTransactions());

      if (result.duplicates > 0 && result.imported === 0) {
        setNotification({
          type: 'warning',
          message: `Todas as ${result.duplicates} transações já existem. Nenhuma duplicata importada.`,
        });
      } else if (result.duplicates > 0) {
        setNotification({
          type: 'success',
          message: `${result.imported} importadas, ${result.duplicates} duplicatas ignoradas.`,
        });
      } else {
        setNotification({
          type: 'success',
          message: `${result.imported} transações importadas de "${fileName}".`,
        });
      }
    } catch {
      setNotification({ type: 'warning', message: 'Erro ao ler o arquivo OFX. Verifique o formato.' });
    }
  };

  const handleClear = () => {
    clearTransactions();
    clearAllAttachments();
    setTransactions([]);
    setNotification({ type: 'success', message: 'Todas as transações foram removidas.' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2.5">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Importador OFX</h1>
              <p className="text-sm text-muted-foreground">Importe extratos sem duplicatas</p>
            </div>
          </div>
          {transactions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Limpar
            </Button>
          )}
        </div>

        {/* Notification */}
        {notification && (
          <div className={`
            flex items-center gap-3 rounded-xl px-4 py-3 mb-6 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300
            ${notification.type === 'success'
              ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
              : 'bg-destructive/10 text-destructive'
            }
          `}>
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {notification.message}
          </div>
        )}

        {/* Dropzone */}
        <div className="mb-8">
          <FileDropzone onFileSelect={handleFileSelect} />
        </div>

        {/* Transactions */}
        {transactions.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {transactions.length} transaç{transactions.length === 1 ? 'ão' : 'ões'}
            </p>
            <TransactionTable transactions={transactions} />
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhuma transação importada ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
