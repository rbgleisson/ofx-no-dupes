import { useState, useRef, useEffect } from 'react';
import { OFXTransaction } from '@/lib/ofxParser';
import { ArrowDownLeft, ArrowUpRight, Paperclip, X, FileText, Loader2 } from 'lucide-react';
import { uploadAttachment, removeAttachment, getAllAttachments } from '@/lib/attachmentStore';

interface TransactionTableProps {
  transactions: OFXTransaction[];
}

const TransactionTable = ({ transactions }: TransactionTableProps) => {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);

  useEffect(() => {
    setAttachments(getAllAttachments());
  }, []);

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const credits = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const debits = transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string) => {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  };

  const handleAttachClick = (txId: string) => {
    setActiveTransactionId(txId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTransactionId) return;

    setUploading(activeTransactionId);
    try {
      const url = await uploadAttachment(activeTransactionId, file);
      setAttachments(prev => ({ ...prev, [activeTransactionId]: url }));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(null);
      setActiveTransactionId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (txId: string) => {
    setUploading(txId);
    try {
      await removeAttachment(txId);
      setAttachments(prev => {
        const next = { ...prev };
        delete next[txId];
        return next;
      });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
      />

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
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Anexo</th>
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
                  <td className="px-4 py-3 text-center">
                    {uploading === tx.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                    ) : attachments[tx.id] ? (
                      <div className="flex items-center justify-center gap-1">
                        <a
                          href={attachments[tx.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 transition-colors"
                          title="Ver documento"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleRemoveAttachment(tx.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Remover anexo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAttachClick(tx.id)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Anexar documento"
                      >
                        <Paperclip className="w-4 h-4 mx-auto" />
                      </button>
                    )}
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
