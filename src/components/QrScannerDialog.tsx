import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Keyboard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface QrScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onAccessKey: (key: string) => void;
}

function extractAccessKey(qrData: string): string | null {
  // NF-e QR codes contain a URL with chNFe parameter or a 44-digit key
  const match44 = qrData.match(/(\d{44})/);
  if (match44) return match44[1];

  const urlMatch = qrData.match(/chNFe=(\d{44})/i);
  if (urlMatch) return urlMatch[1];

  const pMatch = qrData.match(/p=(\d{44})/i);
  if (pMatch) return pMatch[1];

  return null;
}

const QrScannerDialog = ({ open, onClose, onAccessKey }: QrScannerDialogProps) => {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualKey, setManualKey] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<string>('qr-reader-' + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!open || mode !== 'camera') return;

    let mounted = true;
    const startScanner = async () => {
      // Wait for DOM element
      await new Promise(r => setTimeout(r, 300));
      if (!mounted) return;

      try {
        const scanner = new Html5Qrcode(containerRef.current);
        scannerRef.current = scanner;
        setScanning(true);

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const key = extractAccessKey(decodedText);
            if (key) {
              scanner.stop().catch(() => {});
              scannerRef.current = null;
              setScanning(false);
              onAccessKey(key);
              onClose();
            } else {
              toast.error('QR Code não contém uma chave de acesso válida');
            }
          },
          () => {} // ignore scan failures
        );
      } catch (err) {
        console.error('Camera error:', err);
        setScanning(false);
        toast.error('Não foi possível acessar a câmera. Tente inserir a chave manualmente.');
        setMode('manual');
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setScanning(false);
    };
  }, [open, mode]);

  const handleManualSubmit = () => {
    const cleaned = manualKey.replace(/\D/g, '');
    if (cleaned.length !== 44) {
      toast.error('A chave de acesso deve ter 44 dígitos');
      return;
    }
    onAccessKey(cleaned);
    onClose();
    setManualKey('');
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      onClose();
      setManualKey('');
      setMode('camera');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear Nota Fiscal</DialogTitle>
          <DialogDescription>
            Aponte a câmera para o QR Code da nota ou insira a chave de acesso manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'camera' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('camera')}
          >
            <Camera className="w-4 h-4 mr-1.5" />
            Câmera
          </Button>
          <Button
            variant={mode === 'manual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('manual')}
          >
            <Keyboard className="w-4 h-4 mr-1.5" />
            Manual
          </Button>
        </div>

        {mode === 'camera' ? (
          <div className="space-y-3">
            <div
              id={containerRef.current}
              className="w-full rounded-lg overflow-hidden bg-muted aspect-square max-h-[300px]"
            />
            {scanning && (
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Escaneando...
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              placeholder="Cole a chave de acesso (44 dígitos)"
              value={manualKey}
              onChange={e => setManualKey(e.target.value)}
              maxLength={50}
            />
            <Button onClick={handleManualSubmit} className="w-full">
              Buscar Nota
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QrScannerDialog;
