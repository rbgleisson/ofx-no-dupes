import { useState } from 'react';
import QrScannerDialog from '@/components/QrScannerDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ScanLine, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QrTransactionScannerProps {
  onDataExtracted: (data: { date?: string; amount?: number; description?: string; memo?: string }) => void;
}

const QrTransactionScanner = ({ onDataExtracted }: QrTransactionScannerProps) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccessKey = async (key: string) => {
    setLoading(true);
    try {
      // Use AI to extract data from the NF-e access key
      const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data, error } = await supabase.functions.invoke('extract-nfe-data', {
        body: { access_key: key },
      });

      if (error) throw error;

      if (data?.date || data?.amount || data?.name) {
        onDataExtracted({
          date: data.date || undefined,
          amount: data.amount != null ? data.amount : undefined,
          description: data.name || undefined,
          memo: data.memo ? `${data.memo} | NF-e: ${key}` : `NF-e: ${key}`,
        });
        toast.success('Dados da NF-e extraídos! Revise antes de salvar.');
      } else {
        // Fallback: just put the key in memo
        onDataExtracted({
          memo: `NF-e: ${key}`,
        });
        toast.info('Chave NF-e capturada. Preencha os demais campos.');
      }
    } catch (err) {
      console.error('NF-e extraction error:', err);
      // Fallback: just put the key in memo
      onDataExtracted({
        memo: `NF-e: ${key}`,
      });
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
        {loading ? 'Extraindo dados...' : 'Escanear QR Code NF-e'}
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
