import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  fetchPositions,
  previousBalanceFor,
  savePosition,
  type InvestmentPosition,
} from '@/lib/investmentPositions';
import { round2 } from '@/lib/accountBalances';
import type { Account } from '@/components/AccountsManager';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const parseAmount = (v: string) => {
  const cleaned = (v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};
const toInput = (v: number) => v.toFixed(2).replace('.', ',');

interface Props {
  account: Account | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function InvestmentPositionDialog({ account, onClose, onSaved }: Props) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);
  const [saldoAtual, setSaldoAtual] = useState('0,00');
  const [rendimento, setRendimento] = useState('0,00');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!account) return;
    const t = new Date();
    setMonth(t.getMonth() + 1);
    setYear(t.getFullYear());
    fetchPositions(account.id).then(setPositions).catch(() => setPositions([]));
  }, [account?.id]);

  const saldoAnterior = useMemo(
    () => (account ? previousBalanceFor(positions, account.id, year, month) : 0),
    [positions, account?.id, year, month]
  );

  const existing = useMemo(
    () => positions.find(p => p.year === year && p.month === month) || null,
    [positions, year, month]
  );

  useEffect(() => {
    setSaldoAtual(toInput(existing ? existing.saldo_atual : saldoAnterior));
    setRendimento(toInput(existing ? existing.rendimento_mes : 0));
  }, [existing, saldoAnterior]);

  const handleSave = async () => {
    if (!account) return;
    setSaving(true);
    try {
      await savePosition({
        accountId: account.id,
        year,
        month,
        saldoAnterior,
        saldoAtual: parseAmount(saldoAtual),
        rendimentoMes: parseAmount(rendimento),
        aplicadoNoMes: existing?.aplicado_no_mes ?? 0,
      });
      toast.success('Posição da aplicação salva.');
      setPositions(await fetchPositions(account.id));
      onSaved?.();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const years = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 4 + i);
  const diff = round2(parseAmount(saldoAtual) - saldoAnterior);

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Posição mensal da aplicação</DialogTitle>
          <DialogDescription>
            {account?.name} — informe o saldo do extrato da aplicação e o rendimento do mês.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mês</Label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
            Saldo anterior (herdado do mês passado): <strong>{fmt(saldoAnterior)}</strong>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Saldo atual</Label>
              <Input value={saldoAtual} onChange={e => setSaldoAtual(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label className="text-xs">Rendimento do mês</Label>
              <Input value={rendimento} onChange={e => setRendimento(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Variação no mês: <strong>{fmt(diff)}</strong>
            {existing ? ' · já existe registro para este mês (será atualizado)' : ''}
          </p>

          {positions.length > 0 && (
            <div>
              <Label className="text-xs">Histórico</Label>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-1 rounded-md border p-2 bg-muted/30">
                {positions.map(p => (
                  <div key={p.id} className="text-xs flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{MONTHS[p.month - 1]}/{p.year}</span>
                    <span>
                      Saldo {fmt(p.saldo_atual)}
                      {' · '}
                      <span className="text-emerald-600">Rend. {fmt(p.rendimento_mes)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handleSave} disabled={saving}>Salvar posição</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
