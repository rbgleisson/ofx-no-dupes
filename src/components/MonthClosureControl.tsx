import { useEffect, useState } from 'react';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { canReopenMonth, fetchMonthClosure, setMonthClosed, type MonthClosure } from '@/lib/monthClosure';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Props {
  organizationId: string | null;
  year?: number;
  month?: number;
  canClose: boolean;
}

export default function MonthClosureControl({ organizationId, year, month, canClose }: Props) {
  const [closure, setClosure] = useState<MonthClosure | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setConfirmOpen(false);
    setClosure(null);
    setError(false);
    if (!organizationId || !year || !month) { setLoading(false); return; }
    Promise.all([fetchMonthClosure(organizationId, year, month), supabase.auth.getUser()])
      .then(([value, auth]) => { if (!cancelled) { setClosure(value); setUserId(auth.data.user?.id ?? null); } })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const onFocus = () => setRefresh(value => value + 1);
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [organizationId, year, month, refresh]);

  if (!organizationId || !year || !month) return null;
  const period = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const canReopen = canReopenMonth(closure, userId);
  const change = async () => {
    setBusy(true);
    try {
      await setMonthClosed(organizationId, year, month, !closure);
      setConfirmOpen(false);
      setRefresh(value => value + 1);
      toast.success(closure ? 'Mês liberado para alterações.' : 'Mês fechado com a contabilidade.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (err as { message?: string })?.message || 'Não foi possível alterar o fechamento.');
      setRefresh(value => value + 1);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3 mb-6" aria-label="Fechamento do mês">
      <div className="flex items-start gap-2 min-w-0">
        {closure ? <LockKeyhole className="w-4 h-4 mt-1 shrink-0 text-primary" /> : <LockKeyholeOpen className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" />}
        <div>
          <p className="text-sm font-medium">{period} · {loading ? 'Consultando fechamento…' : error ? 'Fechamento indisponível' : closure ? 'Fechado com a contabilidade' : 'Aberto'}</p>
          {closure && <p className="text-xs text-muted-foreground">Fechado em {new Date(closure.closed_at).toLocaleDateString('pt-BR')}{canReopen ? ' · por você' : ' · liberação exclusiva de quem fechou'}</p>}
        </div>
      </div>
      {error ? <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</Button> : (closure ? canReopen : canClose) && (
        <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => setConfirmOpen(true)}>
          {closure ? <LockKeyholeOpen className="w-4 h-4 mr-2" /> : <LockKeyhole className="w-4 h-4 mr-2" />}
          {closure ? 'Liberar mês' : 'Fechar mês'}
        </Button>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={value => { if (!busy) setConfirmOpen(value); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{closure ? 'Liberar' : 'Fechar'} {period}?</AlertDialogTitle>
            <AlertDialogDescription>{closure
              ? 'Os dados deste mês poderão ser alterados novamente.'
              : 'Confirma que este mês já foi conferido com a contabilidade? Lançamentos, importações e saldos ficarão bloqueados. Consultas e exportações continuam disponíveis. Somente você poderá liberar o mês.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button disabled={busy} onClick={change}>{busy ? 'Aguarde…' : closure ? 'Confirmar liberação' : 'Confirmar fechamento'}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}