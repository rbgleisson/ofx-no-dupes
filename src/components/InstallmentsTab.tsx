import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, CheckCircle, XCircle, Receipt, Download } from 'lucide-react';
import { exportInstallments } from '@/lib/installmentsExport';
import { fetchInstallments as fetchAllInstallments } from '@/lib/installmentStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Installment, fetchInstallments, payInstallment, unpayInstallment, deleteInstallmentGroup, getInstallmentSummary } from '@/lib/installmentStore';
import { Category } from '@/components/CategoriesManager';
import { Account } from '@/components/AccountsManager';
import InstallmentFormDialog from './InstallmentFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Props {
  categories: Category[];
  accounts: Account[];
  organizationId: string | null;
  onTransactionsChange: () => void;
}

export default function InstallmentsTab({ categories, accounts, organizationId, onTransactionsChange }: Props) {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [showPaid, setShowPaid] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [subTab, setSubTab] = useState<'payable' | 'receivable'>('payable');
  const [filterMonth, setFilterMonth] = useState<string>('__all__');
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const loadInstallments = useCallback(async () => {
    try {
      const data = await fetchInstallments(organizationId, undefined, showPaid);
      setInstallments(data);
    } catch (err) {
      console.error('Error loading installments:', err);
    }
  }, [organizationId, showPaid]);

  useEffect(() => { loadInstallments(); }, [loadInstallments]);

  const handlePay = async (inst: Installment) => {
    try {
      await payInstallment(inst);
      toast.success(`Parcela ${inst.installment_number}/${inst.total_installments} baixada!`);
      await loadInstallments();
      onTransactionsChange();
    } catch {
      toast.error('Erro ao baixar parcela.');
    }
  };

  const handleUnpay = async (inst: Installment) => {
    try {
      await unpayInstallment(inst);
      toast.success('Baixa revertida.');
      await loadInstallments();
      onTransactionsChange();
    } catch {
      toast.error('Erro ao reverter baixa.');
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupId) return;
    try {
      await deleteInstallmentGroup(deleteGroupId);
      toast.success('Parcelas excluídas.');
      setDeleteGroupId(null);
      await loadInstallments();
    } catch {
      toast.error('Erro ao excluir.');
    }
  };

  const filtered = installments.filter(i => {
    if (i.type !== subTab) return false;
    if (filterMonth !== '__all__') {
      const month = parseInt(filterMonth, 10);
      const dueMonth = new Date(i.due_date + 'T12:00:00').getMonth();
      if (dueMonth !== month) return false;
    }
    return true;
  });
  const summary = getInstallmentSummary(installments);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string) => {
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate + 'T23:59:59') < new Date();
  };

  // Group by group_id for display
  const groups = new Map<string, Installment[]>();
  filtered.forEach(i => {
    const arr = groups.get(i.group_id) || [];
    arr.push(i);
    groups.set(i.group_id, arr);
  });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="hidden sm:grid grid-cols-2 gap-4">
        <div className="rounded-xl border p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
          <p className="text-xs font-medium text-muted-foreground mb-1">Total a Pagar ({summary.countPayable} parcelas)</p>
          <p className="text-lg font-bold text-red-600">{fmt(summary.totalPayable)}</p>
        </div>
        <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <p className="text-xs font-medium text-muted-foreground mb-1">Total a Receber ({summary.countReceivable} parcelas)</p>
          <p className="text-lg font-bold text-emerald-600">{fmt(summary.totalReceivable)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setFormOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-1.5" /> Nova Conta
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={showPaid} onCheckedChange={v => setShowPaid(!!v)} />
            Mostrar pagas
          </label>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[150px] h-8 text-sm">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os meses</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={v => setSubTab(v as 'payable' | 'receivable')}>
        <TabsList>
          <TabsTrigger value="payable" className="text-red-600">A Pagar</TabsTrigger>
          <TabsTrigger value="receivable" className="text-emerald-600">A Receber</TabsTrigger>
        </TabsList>

        {(['payable', 'receivable'] as const).map(tab => (
          <TabsContent key={tab} value={tab}>
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhuma parcela {tab === 'payable' ? 'a pagar' : 'a receber'} encontrada.
              </div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>NF</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(inst => {
                      const cat = categories.find(c => c.id === inst.category_id);
                      const overdue = !inst.is_paid && isOverdue(inst.due_date);
                      return (
                        <TableRow key={inst.id} className={inst.is_paid ? 'opacity-50' : overdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                          <TableCell>
                            {inst.is_paid ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Receipt className="w-4 h-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {inst.description}
                            {overdue && <Badge variant="destructive" className="ml-2 text-[10px]">Vencida</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{inst.invoice_number || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {inst.installment_number}/{inst.total_installments}
                            </Badge>
                          </TableCell>
                          <TableCell className={overdue ? 'text-red-600 font-medium' : ''}>{fmtDate(inst.due_date)}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{fmt(inst.amount)}</TableCell>
                          <TableCell>
                            {cat && (
                              <Badge variant="outline" style={{ borderColor: cat.color, color: cat.color }} className="text-xs">
                                {cat.name}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {!inst.is_paid ? (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Dar baixa" onClick={() => handlePay(inst)}>
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                              ) : (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500" title="Reverter baixa" onClick={() => handleUnpay(inst)}>
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir grupo" onClick={() => setDeleteGroupId(inst.group_id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <InstallmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        accounts={accounts}
        onSaved={loadInstallments}
      />

      <AlertDialog open={!!deleteGroupId} onOpenChange={() => setDeleteGroupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir todas as parcelas deste grupo?</AlertDialogTitle>
            <AlertDialogDescription>Todas as parcelas vinculadas serão removidas permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
