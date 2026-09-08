import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

const SendToAccountantDialog = () => {
  const { organization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));
  const [sending, setSending] = useState(false);

  const accountantEmail = (organization as any)?.accountant_email as string | undefined;

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-accountant-report', {
        body: { month: Number(month), year: Number(year) },
      });
      let details: any = data;
      if (error) {
        try { details = JSON.parse(await (error as any).context.text()); } catch { details = null; }
        throw new Error(details?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      toast.success(`Relatório enviado para ${data.to}`);
      setOpen(false);
    } catch (err: any) {
      toast.error('Não foi possível enviar: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full justify-start">
          <Send className="w-4 h-4 mr-1.5 text-sky-600" />
          Enviar para o contador
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar para o contador</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {accountantEmail
            ? <>O relatório será enviado para <strong>{accountantEmail}</strong>, no modelo salvo nas configurações da empresa.</>
            : <>Nenhum e-mail de contador configurado. Defina em Configurações da Empresa.</>}
        </p>

        <div className="flex gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSend} disabled={sending || !accountantEmail}>
            {sending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            {sending ? 'Enviando...' : 'Enviar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendToAccountantDialog;
