import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ALL_COLUMNS } from '@/components/ExportDialog';
import { Loader2, Mail, ArrowUp, ArrowDown } from 'lucide-react';

export const DEFAULT_ACCOUNTANT_COLUMNS = [
  'date', 'description', 'amount', 'category_code', 'category', 'account', 'chart_account_code',
];

const AccountantSettings = () => {
  const { organization, organizationId, reload } = useOrganization();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<string[]>(DEFAULT_ACCOUNTANT_COLUMNS);
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_ACCOUNTANT_COLUMNS));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const org = organization as any;
    if (!org) return;
    setEmail(org.accountant_email || '');
    const saved: string[] | null = Array.isArray(org.accountant_columns) ? org.accountant_columns : null;
    const base = saved?.length ? saved : DEFAULT_ACCOUNTANT_COLUMNS;
    const rest = ALL_COLUMNS.map(c => c.key).filter(k => !base.includes(k));
    setOrder([...base, ...rest]);
    setSelected(new Set(base));
  }, [organization]);

  const move = (index: number, dir: -1 | 1) => {
    setOrder(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!organizationId) return;
    const columns = order.filter(k => selected.has(k));
    if (columns.length === 0) {
      toast({ title: 'Erro', description: 'Selecione pelo menos uma coluna.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ accountant_email: email.trim() || null, accountant_columns: columns } as any)
        .eq('id', organizationId);
      if (error) throw error;
      toast({ title: 'Salvo', description: 'Configuração do contador atualizada.' });
      await reload();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const labelOf = (key: string) => ALL_COLUMNS.find(c => c.key === key)?.label || key;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Envio para o Contador</h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor="accountant-email">E-mail do contador</Label>
        <Input
          id="accountant-email"
          type="email"
          placeholder="contador@escritorio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>Modelo de exportação (colunas e ordem)</Label>
        <p className="text-xs text-muted-foreground pb-1">
          Marque as colunas e use as setas para definir a ordem em que aparecem na planilha.
        </p>
        <div className="rounded-lg border divide-y">
          {order.map((key, i) => (
            <div key={key} className="flex items-center gap-2 px-3 py-2">
              <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
              <span className={`flex-1 text-sm ${selected.has(key) ? '' : 'text-muted-foreground line-through'}`}>
                {labelOf(key)}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === order.length - 1}>
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Salvar configuração
      </Button>
    </div>
  );
};

export default AccountantSettings;
