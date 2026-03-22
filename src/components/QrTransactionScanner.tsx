import { useState } from 'react';
import QrScannerDialog from '@/components/QrScannerDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ScanLine, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Category } from '@/components/CategoriesManager';

interface QrTransactionScannerProps {
  categories: Category[];
  onDataExtracted: (data: {
    date?: string;
    amount?: number;
    description?: string;
    memo?: string;
    category_id?: string | null;
  }) => void;
}

const QrTransactionScanner = ({ categories, onDataExtracted }: QrTransactionScannerProps) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccessKey = async (key: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-nfe-data', {
        body: {
          access_key: key,
          categories: categories.map(c => ({ id: c.id, name: c.name })),
        },
      });

      if (error) throw error;

      if (data?.date || data?.amount || data?.name || data?.description) {
        onDataExtracted({
          date: data.date || undefined,
          amount: data.amount != null ? data.amount : undefined,
          description: data.description || data.name || undefined,
          memo: data.memo ? `${data.memo} | NF-e: ${key}` : `NF-e: ${key}`,
          category_id: data.category_id || undefined,
        });
        toast.success('Dados da NF-e extraídos com IA! Revise antes de salvar.');
      } else {
        onDataExtracted({ memo: `NF-e: ${key}` });
        toast.info('Chave NF-e capturada. Preencha os demais campos.');
      }
    } catch (err) {
      console.error('NF-e extraction error:', err);
      onDataExtracted({ memo: `NF-e: ${key}` });
      toast.info('Chave NF-e capturada. Preencha os demais campos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs gap-1.5"
        onClick={() => setScannerOpen(true)}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ScanLine className="h-3.5 w-3.5" />
        )}
        {loading ? 'IA analisando NF-e...' : 'Escanear QR Code NF-e'}
      </Button>
      <QrScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onAccessKey={(key) => {
          setScannerOpen(false);
          handleAccessKey(key);
        }}
      />
    </>
  );
};

export default QrTransactionScanner;
