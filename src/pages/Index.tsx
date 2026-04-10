import { useState, useEffect, useCallback, useRef } from 'react';
import { parseOFX } from '@/lib/ofxParser';
import logoImg from '@/assets/logo.png';
import {
  Transaction,
  TransactionFilters,
  fetchTransactions,
  importTransactions,
  clearTransactions,
  addTransaction,
  addTransactionsBulk,
  updateTransaction,
  ImportResult,
} from '@/lib/transactionStore';
import { supabase } from '@/integrations/supabase/client';
import { classifyTransaction, ensureSystemCategories } from '@/lib/autoCategorize';
import { clearAppBrowserStorage } from '@/lib/storageMaintenance';

import TransactionTable from '@/components/TransactionTable';
import TransactionFiltersComponent from '@/components/TransactionFilters';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import CategoriesManager, { Category } from '@/components/CategoriesManager';
import AccountsManager, { Account } from '@/components/AccountsManager';
import ChartAccountsManager, { ChartAccount } from '@/components/ChartAccountsManager';
import ExportDialog from '@/components/ExportDialog';
import ExcelImportReviewDialog from '@/components/ExcelImportReviewDialog';
import { ExcelRow, parseExcelFile, downloadExcelTemplate } from '@/lib/excelImport';
import { Trash2, FileText, CheckCircle2, AlertCircle, Plus, Upload, LogOut, Download, FileSpreadsheet, HardDrive, Shield, Building, FolderDown, FolderUp, ChevronDown, BarChart3, Receipt } from 'lucide-react';
import InstallmentsTab from '@/components/InstallmentsTab';
import { fetchInstallments, getInstallmentSummary, Installment } from '@/lib/installmentStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportCategoriesAndChartAccounts, importCategoriesAndChartAccounts } from '@/lib/catalogExportImport';
import { exportMonthlySummary } from '@/lib/monthlySummaryExport';
import { createFullBackup } from '@/lib/backupExport';
import MobileMenu from '@/components/MobileMenu';
import ChangePasswordDialog from '@/components/ChangePasswordDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { useOrganization } from '@/hooks/useOrganization';

interface IndexProps {
  onOpenAdmin?: () => void;
  onOpenOrgSettings?: () => void;
}

const Index = ({ onOpenAdmin, onOpenOrgSettings }: IndexProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const now = new Date();
  const [filters, setFilters] = useState<TransactionFilters>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [activeTab, setActiveTab] = useState<'payable' | 'receivable'>('payable');
  const [mainTab, setMainTab] = useState<'transactions' | 'installments'>('transactions');
  const [installmentSummary, setInstallmentSummary] = useState({ totalPayable: 0, totalReceivable: 0, countPayable: 0, countReceivable: 0 });
  const [notification, setNotification] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [backupProgress, setBackupProgress] = useState<string | null>(null);
  const ofxInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const catalogImportRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const { permissions, isAdmin, isSuperAdmin, isOwner } = usePermissions();
  const { organization, organizationId } = useOrganization();
  const [excelReviewOpen, setExcelReviewOpen] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);

  const handleOfxFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      handleFileSelect(content, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleXlsxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setNotification({ type: 'warning', message: 'Nenhuma transação encontrada na planilha.' });
        return;
      }
      setExcelRows(rows);
      setExcelReviewOpen(true);
    } catch {
      setNotification({ type: 'warning', message: 'Erro ao ler a planilha. Verifique o formato.' });
    }
    e.target.value = '';
  };

  const handleExcelConfirm = async (rows: ExcelRow[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setNotification({ type: 'warning', message: 'Usuário não autenticado.' }); return; }

      const toInsert = rows.map(r => ({
        date: r.date,
        amount: r.amount,
        description: r.description,
        memo: r.memo || undefined,
        category_id: r.category_id || null,
        account_id: r.account_id || null,
        chart_account_id: r.chart_account_id || null,
        is_transfer: r._is_transfer || false,
        ...(r._fit_id ? { fit_id: r._fit_id, type: r._type } : {}),
      }));

      await addTransactionsBulk(toInsert);

      setExcelReviewOpen(false);
      await fetchCategories();
      await loadTransactions();
      setNotification({ type: 'success', message: `${toInsert.length} transações importadas.` });
    } catch {
      setNotification({ type: 'warning', message: 'Erro ao importar transações.' });
    }
  };

  const loadTransactions = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    try {
      const data = await fetchTransactions(filters, organizationId);
      if (requestId === loadRequestRef.current) {
        setTransactions(data);
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
    }
  }, [filters, organizationId]);

  const fetchCategories = useCallback(async () => {
    let query = supabase.from('categories').select('*').order('name');
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data } = await query;
    if (data) setCategories(data as Category[]);
  }, [organizationId]);

  const fetchAccounts = useCallback(async () => {
    let query = supabase.from('accounts').select('*').order('name');
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data } = await query;
    if (data) setAccounts(data as Account[]);
  }, [organizationId]);

  const fetchChartAccounts = useCallback(async () => {
    let query = supabase.from('chart_accounts').select('*').order('code');
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data } = await query;
    if (data) setChartAccounts(data as ChartAccount[]);
  }, [organizationId]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const loadInstallmentSummary = useCallback(async () => {
    try {
      const data = await fetchInstallments(organizationId, undefined, false);
      setInstallmentSummary(getInstallmentSummary(data));
    } catch {}
  }, [organizationId]);

  useEffect(() => {
    fetchCategories();
    fetchAccounts();
    fetchChartAccounts();
    loadInstallmentSummary();
  }, [fetchCategories, fetchAccounts, fetchChartAccounts, loadInstallmentSummary]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleFileSelect = async (content: string, fileName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNotification({ type: 'warning', message: 'Usuário não autenticado.' });
        return;
      }

      const data = parseOFX(content);
      if (data.transactions.length === 0) {
        setNotification({ type: 'warning', message: 'Nenhuma transação encontrada no arquivo.' });
        return;
      }

      // Auto-create or find account from OFX bank info
      let accountId: string | null = null;
      if (data.bankId || data.accountId) {
        const accountName = [data.bankId, data.accountId].filter(Boolean).join(' - ');
        const { data: existing } = await supabase
          .from('accounts')
          .select('id')
          .eq('name', accountName)
          .maybeSingle();

        if (existing) {
          accountId = existing.id;
        } else {
          const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
          const { data: created } = await supabase
            .from('accounts')
            .insert({ name: accountName, user_id: user.id, organization_id: orgId })
            .select('id')
            .single();
          if (created) {
            accountId = created.id;
            await fetchAccounts();
          }
        }
      }

      // Filter out fit_id duplicates first — fetch ALL fit_ids for the org
      const { data: orgIdData } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
      let allFitIds: string[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        let q = supabase.from('transactions').select('fit_id').range(from, from + PAGE - 1);
        if (orgIdData) q = q.eq('organization_id', orgIdData);
        const { data: page } = await q;
        if (!page || page.length === 0) break;
        allFitIds = allFitIds.concat(page.map(t => t.fit_id).filter(Boolean) as string[]);
        if (page.length < PAGE) break;
        from += PAGE;
      }
      const existingFitIds = new Set(allFitIds);

      // Filter by composite id AND raw fitId, then deduplicate within the batch
      const seenIds = new Set<string>();
      const uniqueByFitId = data.transactions.filter(t => {
        // Check against DB (composite id stored as fit_id)
        if (existingFitIds.has(t.id)) return false;
        // Also check raw fitId if non-empty (some banks reuse fitIds)
        if (t.fitId && existingFitIds.has(t.fitId)) return false;
        // Deduplicate within the same batch
        if (seenIds.has(t.id)) return false;
        seenIds.add(t.id);
        return true;
      });

      if (uniqueByFitId.length === 0) {
        setNotification({ type: 'warning', message: `Todas as ${data.transactions.length} transações já existem (fit_id duplicado).` });
        return;
      }

      // Auto-categorize transactions
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { transferCategoryId, investmentIncomeCategoryId, tithesOfferingsCategoryId } = await ensureSystemCategories(currentUser!.id);

      // Convert to ExcelRow format and open review dialog for duplicate detection
      const rows: ExcelRow[] = uniqueByFitId.map(t => {
        const classification = classifyTransaction(t.description, t.amount, transferCategoryId, investmentIncomeCategoryId, tithesOfferingsCategoryId);
        return {
          date: t.date,
          amount: t.amount,
          description: t.description,
          memo: t.memo || undefined,
          category_id: classification.category_id,
          account_id: accountId,
          chart_account_id: null,
          _fit_id: t.id,
          _type: t.type,
          _is_transfer: classification.is_transfer,
        };
      });

      setExcelRows(rows);
      setExcelReviewOpen(true);

      if (data.transactions.length > uniqueByFitId.length) {
        const skipped = data.transactions.length - uniqueByFitId.length;
        setNotification({ type: 'warning', message: `${skipped} transações com fit_id duplicado foram removidas automaticamente.` });
      }
    } catch (err: any) {
      console.error('OFX import error:', err);
      const msg = err?.message || '';
      if (msg.includes('duplicate') || msg.includes('violates')) {
        setNotification({ type: 'warning', message: 'Erro de duplicidade ao importar. Tente novamente.' });
      } else {
        setNotification({ type: 'warning', message: `Erro ao importar OFX: ${msg || 'Verifique o formato.'}` });
      }
    }
  };

  const handleClear = async () => {
    if (!confirm('⚠️ ATENÇÃO: Isso vai remover TODOS os lançamentos permanentemente. Deseja continuar?')) return;
    const typed = prompt('Para confirmar, digite a palavra "APAGAR" abaixo:');
    if (typed?.trim().toUpperCase() !== 'APAGAR') {
      setNotification({ type: 'warning', message: 'Operação cancelada. A palavra digitada não confere.' });
      return;
    }
    await clearTransactions();
    setTransactions([]);
    setNotification({ type: 'success', message: 'Todos os lançamentos foram removidos.' });
  };

  const handleSaveTransaction = async (data: {
    date: string;
    amount: number;
    description: string;
    memo?: string;
    category_id?: string | null;
    account_id?: string | null;
    chart_account_id?: string | null;
    attachment_url?: string | null;
  }) => {
    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, data);
        setNotification({ type: 'success', message: 'Lançamento atualizado.' });
      } else {
        await addTransaction(data);
        setNotification({ type: 'success', message: 'Lançamento adicionado.' });
      }
      setEditingTransaction(null);
      await loadTransactions();
    } catch {
      setNotification({ type: 'warning', message: 'Erro ao salvar lançamento.' });
    }
  };

  const handleLogout = async () => {
    clearAppBrowserStorage();
    await supabase.auth.signOut();
  };

  const handleCatalogImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importCategoriesAndChartAccounts(file);
      await fetchCategories();
      await fetchChartAccounts();
      setNotification({ type: 'success', message: `Importado: ${result.categories} categorias e ${result.chartAccounts} contas contábeis.` });
    } catch (err: any) {
      setNotification({ type: 'warning', message: 'Erro ao importar: ' + (err.message || 'Verifique o arquivo.') });
    }
    e.target.value = '';
  };

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setFormOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[95vw] mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Sistema Financeiro" className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Sistema Financeiro</h1>
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const hour = new Date().getHours();
                  const greeting = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
                  const orgName = organization?.name;
                  return orgName ? `Olá ${orgName}, ${greeting}!` : `${greeting}!`;
                })()}
              </p>
            </div>
          </div>
          {/* Desktop buttons */}
          <div className="hidden lg:flex items-center gap-2 flex-wrap">
            {permissions.can_create_transactions && (
              <Button size="sm" onClick={() => { setEditingTransaction(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                <Plus className="w-4 h-4 mr-1.5" />
                Lançamento
              </Button>
            )}
            {permissions.can_manage_accounts && (
              <AccountsManager accounts={accounts} onAccountsChange={fetchAccounts} />
            )}
            {permissions.can_manage_categories && (
              <CategoriesManager categories={categories} onCategoriesChange={fetchCategories} />
            )}
            {permissions.can_manage_chart_accounts && (
              <ChartAccountsManager chartAccounts={chartAccounts} onChartAccountsChange={fetchChartAccounts} />
            )}
            {/* Importações & Exportações dropdown */}
            <input ref={ofxInputRef} type="file" accept=".ofx,.qfx" onChange={handleOfxFileChange} className="hidden" />
            <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" onChange={handleXlsxFileChange} className="hidden" />
            <input ref={catalogImportRef} type="file" accept=".xlsx,.xls" onChange={handleCatalogImport} className="hidden" />
            {(permissions.can_import || permissions.can_export || permissions.can_manage_categories || permissions.can_manage_chart_accounts) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="border-primary/30 text-primary">
                    <FolderDown className="w-4 h-4 mr-1.5" />
                    Importações & Exportações
                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {permissions.can_import && (
                    <>
                      <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Importações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => ofxInputRef.current?.click()} className="cursor-pointer">
                        <Upload className="w-4 h-4 mr-2 text-slate-600" />
                        Importar OFX
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => xlsxInputRef.current?.click()} className="cursor-pointer">
                        <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                        Importar Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={downloadExcelTemplate} className="cursor-pointer">
                        <Download className="w-4 h-4 mr-2 text-muted-foreground" />
                        Baixar Modelo Excel
                      </DropdownMenuItem>
                    </>
                  )}
                  {permissions.can_import && (permissions.can_export || permissions.can_manage_categories || permissions.can_manage_chart_accounts) && (
                    <DropdownMenuSeparator />
                  )}
                  {permissions.can_export && (
                    <>
                      <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Exportações</DropdownMenuLabel>
                      <div className="px-1 pb-1">
                        <ExportDialog transactions={transactions} categories={categories} accounts={accounts} chartAccounts={chartAccounts} />
                      </div>
                      <DropdownMenuItem
                        onClick={() => {
                          const now = new Date();
                          exportMonthlySummary(categories, organizationId, now.getFullYear(), now.getMonth() + 1)
                            .then(() => setNotification({ type: 'success', message: 'Resumo mensal exportado!' }))
                            .catch(() => setNotification({ type: 'warning', message: 'Erro ao exportar resumo.' }));
                        }}
                        className="cursor-pointer"
                      >
                        <BarChart3 className="w-4 h-4 mr-2 text-blue-600" />
                        Resumo Mensal (Mês Atual)
                      </DropdownMenuItem>
                    </>
                  )}
                  {(permissions.can_manage_categories || permissions.can_manage_chart_accounts) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Cadastros</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => exportCategoriesAndChartAccounts(categories, chartAccounts)} className="cursor-pointer">
                        <FolderDown className="w-4 h-4 mr-2 text-violet-600" />
                        Exportar Categorias
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportCategoriesAndChartAccounts(categories, chartAccounts)} className="cursor-pointer">
                        <FolderDown className="w-4 h-4 mr-2 text-amber-600" />
                        Exportar Plano de Contas
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => catalogImportRef.current?.click()} className="cursor-pointer">
                        <FolderUp className="w-4 h-4 mr-2 text-violet-500" />
                        Importar Cadastros
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {permissions.can_backup && (
              <Button
                size="sm"
                variant="outline"
                disabled={!!backupProgress}
                onClick={async () => {
                  try {
                    await createFullBackup(setBackupProgress);
                    setNotification({ type: 'success', message: 'Backup gerado com sucesso!' });
                  } catch {
                    setNotification({ type: 'warning', message: 'Erro ao gerar backup.' });
                  } finally {
                    setBackupProgress(null);
                  }
                }}
                title="Backup completo (ZIP com dados + anexos)"
              >
                <HardDrive className="w-4 h-4 mr-1.5" />
                {backupProgress || 'Backup'}
              </Button>
            )}
            {permissions.can_clear_all && transactions.length > 0 && (
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
            {(isOwner || isSuperAdmin) && onOpenOrgSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenOrgSettings}
                className="text-primary border-primary/30"
                title="Configurações da Empresa"
              >
                <Building className="w-4 h-4 mr-1.5" />
                Empresa
              </Button>
            )}
            {isSuperAdmin && onOpenAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenAdmin}
                className="text-primary border-primary/30"
                title="Super Admin"
              >
                <Shield className="w-4 h-4 mr-1.5" />
                Admin
              </Button>
            )}
            <ChangePasswordDialog />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          {/* Mobile hamburger menu */}
          <MobileMenu
            onNewTransaction={() => { setEditingTransaction(null); setFormOpen(true); }}
            onClear={handleClear}
            onLogout={handleLogout}
            showClear={transactions.length > 0}
            accountsManager={<AccountsManager accounts={accounts} onAccountsChange={fetchAccounts} />}
            categoriesManager={<CategoriesManager categories={categories} onCategoriesChange={fetchCategories} />}
            chartAccountsManager={<ChartAccountsManager chartAccounts={chartAccounts} onChartAccountsChange={fetchChartAccounts} />}
          />
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


        {/* Summary Cards */}
        {permissions.can_view_totals && transactions.length > 0 && (() => {
          const nonTransfer = transactions.filter(t => !t.is_transfer);
          const totalReceber = nonTransfer.filter(t => Number(t.amount) >= 0).reduce((s, t) => s + Number(t.amount), 0);
          const totalPagar = nonTransfer.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          const saldo = totalReceber - totalPagar;
          const totalTransfer = transactions.filter(t => t.is_transfer).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
          const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          return (
            <>
              <div className="hidden sm:grid grid-cols-4 gap-4 mb-6">
                <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Entradas</p>
                  <p className="text-lg font-bold text-emerald-600">{fmt(totalReceber)}</p>
                </div>
                <div className="rounded-xl border p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Despesas Reais</p>
                  <p className="text-lg font-bold text-red-600">{fmt(-totalPagar)}</p>
                </div>
                <div className={`rounded-xl border p-4 ${saldo >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Saldo</p>
                  <p className={`text-lg font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(saldo)}</p>
                </div>
                <div className="rounded-xl border p-4 bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Movimentações Internas</p>
                  <p className="text-lg font-bold text-gray-500">{fmt(totalTransfer)}</p>
                </div>
              </div>
              {(installmentSummary.countPayable > 0 || installmentSummary.countReceivable > 0) && (
                <div className="hidden sm:grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-xl border p-4 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMainTab('installments')}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      <Receipt className="w-3.5 h-3.5 inline mr-1" />
                      A Pagar ({installmentSummary.countPayable} parcelas)
                    </p>
                    <p className="text-lg font-bold text-orange-600">{fmt(installmentSummary.totalPayable)}</p>
                  </div>
                  <div className="rounded-xl border p-4 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMainTab('installments')}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      <Receipt className="w-3.5 h-3.5 inline mr-1" />
                      A Receber ({installmentSummary.countReceivable} parcelas)
                    </p>
                    <p className="text-lg font-bold text-teal-600">{fmt(installmentSummary.totalReceivable)}</p>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Main Tabs: Transactions vs Installments */}
        <Tabs value={mainTab} onValueChange={v => setMainTab(v as 'transactions' | 'installments')} className="space-y-4">
          <TabsList>
            <TabsTrigger value="transactions">Lançamentos</TabsTrigger>
            <TabsTrigger value="installments">
              <Receipt className="w-4 h-4 mr-1.5" />
              Contas a Pagar/Receber
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'payable' | 'receivable')} className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="payable">A Pagar</TabsTrigger>
                  <TabsTrigger value="receivable">A Receber</TabsTrigger>
                </TabsList>
                <TransactionFiltersComponent filters={filters} onChange={setFilters} categories={categories} accounts={accounts} />
              </div>

              {(['payable', 'receivable'] as const).map((tab) => {
                let filtered = transactions.filter(t =>
                  tab === 'payable' ? Number(t.amount) < 0 : Number(t.amount) >= 0
                );
                if (filters.search) {
                  const searchTerm = filters.search.toLowerCase();
                  const term = searchTerm.replace(',', '.');
                  filtered = filtered.filter(t => {
                    const matchDesc = (t.description ?? '').toLowerCase().includes(searchTerm);
                    const matchMemo = (t.memo ?? '').toLowerCase().includes(searchTerm);
                    const amountStr = Math.abs(Number(t.amount)).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    const matchAmount = amountStr.includes(searchTerm) || Math.abs(Number(t.amount)).toString().includes(term);
                    return matchDesc || matchMemo || matchAmount;
                  });
                }
                return (
                  <TabsContent key={tab} value={tab}>
                    <p className="text-sm text-muted-foreground mb-4">
                      {filtered.length} transaç{filtered.length === 1 ? 'ão' : 'ões'}
                    </p>
                    {filtered.length > 0 ? (
                      <TransactionTable
                        transactions={filtered}
                        categories={categories}
                        accounts={accounts}
                        chartAccounts={chartAccounts}
                        onTransactionsChange={loadTransactions}
                        onEditTransaction={permissions.can_edit_transactions ? handleEditTransaction : undefined}
                        canDelete={permissions.can_delete_transactions}
                      />
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">Nenhuma transação encontrada.</p>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>

          <TabsContent value="installments">
            <InstallmentsTab
              categories={categories}
              accounts={accounts}
              organizationId={organizationId ?? null}
              onTransactionsChange={() => { loadTransactions(); loadInstallmentSummary(); }}
            />
          </TabsContent>
        </Tabs>

        {/* Form Dialog */}
        <TransactionFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          transaction={editingTransaction}
          categories={categories}
          accounts={accounts}
          chartAccounts={chartAccounts}
          onSave={handleSaveTransaction}
        />

        {/* Excel Import Review Dialog */}
        <ExcelImportReviewDialog
          open={excelReviewOpen}
          onOpenChange={setExcelReviewOpen}
          rows={excelRows}
          categories={categories}
          accounts={accounts}
          chartAccounts={chartAccounts}
          existingTransactions={transactions}
          onConfirm={handleExcelConfirm}
        />
      </div>
    </div>
  );
};

export default Index;
