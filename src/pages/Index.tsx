import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { parseOFX, matchContactForOfxTx } from '@/lib/ofxParser';
import { readOfxFile } from '@/lib/ofxFile';
import ContactsManager, { fetchContacts } from '@/components/ContactsManager';
import logoImg from '@/assets/logo.png';
import {
  Transaction,
  TransactionFilters,
  fetchTransactions,
  importTransactions,
  clearTransactions,
  upsertTransactionsByFitId,
  countAllAttachments,
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
import TransferDialog from '@/components/TransferDialog';
import ChartAccountsManager, { ChartAccount } from '@/components/ChartAccountsManager';
import ExportDialog from '@/components/ExportDialog';
import ExcelImportReviewDialog from '@/components/ExcelImportReviewDialog';
import { ExcelRow, parseExcelFile, downloadExcelTemplate } from '@/lib/excelImport';
import { Trash2, FileText, CheckCircle2, AlertCircle, Plus, Upload, LogOut, Download, FileSpreadsheet, HardDrive, Shield, Building, FolderDown, FolderUp, ChevronDown, BarChart3, Receipt, Menu, Wallet } from 'lucide-react';
import InstallmentsTab from '@/components/InstallmentsTab';
import InvestmentsTab from '@/components/InvestmentsTab';
import AccountBalancesSheet from '@/components/AccountBalancesSheet';
import { fetchInstallments, getInstallmentSummary, Installment } from '@/lib/installmentStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { exportCategoriesAndChartAccounts, importCategoriesAndChartAccounts } from '@/lib/catalogExportImport';
import { toast } from 'sonner';
import { exportMonthlySummary } from '@/lib/monthlySummaryExport';
import { computeMonthlyPreviousBalance, fetchOpeningAnchors } from '@/lib/monthlyOpeningBalance';
import { fetchAllRows } from '@/lib/fetchAllRows';
import MonthlySummaryDialog from '@/components/MonthlySummaryDialog';
import SendToAccountantDialog from '@/components/SendToAccountantDialog';

import { createFullBackup } from '@/lib/backupExport';

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
  const [previousBalance, setPreviousBalance] = useState(0);
  const [monthTotals, setMonthTotals] = useState({ entries: 0, exits: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const now = new Date();
  const [filters, setFilters] = useState<TransactionFilters>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [activeTab, setActiveTab] = useState<'payable' | 'receivable'>('payable');
  const [mainTab, setMainTab] = useState<'transactions' | 'installments' | 'investments'>('transactions');
  const [installmentSummary, setInstallmentSummary] = useState({ totalPayable: 0, totalReceivable: 0, countPayable: 0, countReceivable: 0 });
  const [allInstallments, setAllInstallments] = useState<Installment[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);




  // The `is_transfer` flag is the single source of truth: if the user unmarks a
  // transaction as internal (or marks it as Entrada), it counts as real cashflow
  // even when its category is "Transferência Interna".
  const effectiveTransactions = transactions;

  const { permissions, isAdmin, isSuperAdmin, isOwner } = usePermissions();
  const { organization, organizationId } = useOrganization();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const periodAutoAdjusted = useRef(false);
  const previousBalanceRequestRef = useRef(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  // Se o mês atual não tiver lançamentos, abre automaticamente no último mês com dados.
  useEffect(() => {
    if (!organizationId || periodAutoAdjusted.current) return;
    periodAutoAdjusted.current = true;
    (async () => {
      const { data } = await supabase
        .from('transactions')
        .select('date')
        .eq('organization_id', organizationId)
        .order('date', { ascending: false })
        .limit(1);
      const last = data?.[0]?.date;
      if (!last) return;
      const [ly, lm] = last.split('-').map(Number);
      setFilters(prev => {
        if (prev.year === ly && prev.month === lm) return prev;
        if (prev.year !== now.getFullYear() || prev.month !== now.getMonth() + 1) return prev;
        return { ...prev, year: ly, month: lm };
      });
    })();
  }, [organizationId]);


  // Fechamento mensal: sempre o mês inteiro da organização (todas as contas,
  // sem transferências), independente dos filtros da lista.
  useEffect(() => {
    const loadPreviousBalance = async () => {
      const requestId = ++previousBalanceRequestRef.current;
      if (!filters.year || !organizationId) {
        setPreviousBalance(0);
        setMonthTotals({ entries: 0, exits: 0 });
        return;
      }

      const month = filters.month ?? 1;
      const pad = (n: number) => String(n).padStart(2, '0');
      const periodStart = `${filters.year}-${pad(month)}-01`;
      const endYear = filters.month ? (month === 12 ? filters.year + 1 : filters.year) : filters.year + 1;
      const endMonth = filters.month ? (month === 12 ? 1 : month + 1) : 1;
      const periodEnd = `${endYear}-${pad(endMonth)}-01`;

      try {
        const [history, openingAnchors, monthRows] = await Promise.all([
          fetchAllRows<Transaction>(() => supabase
            .from('transactions')
            .select('*')
            .eq('organization_id', organizationId)
            .lt('date', periodStart)),
          fetchOpeningAnchors(organizationId, filters.year, month),
          fetchAllRows<{ amount: number; date: string; id: string }>(() => supabase
            .from('transactions')
            .select('id, amount, date')
            .eq('organization_id', organizationId)
            .eq('is_transfer', false)
            .not('account_id', 'is', null)
            .gte('date', periodStart)
            .lt('date', periodEnd) as any),
        ]);
        const monthlyBalance = computeMonthlyPreviousBalance(
          accounts,
          history,
          openingAnchors,
          filters.year,
          month,
        );
        let entries = 0;
        let exits = 0;
        for (const row of monthRows) {
          const amt = Number(row.amount) || 0;
          if (amt >= 0) entries += amt; else exits += Math.abs(amt);
        }
        if (requestId === previousBalanceRequestRef.current) {
          setPreviousBalance(monthlyBalance.displayed);
          setMonthTotals({
            entries: Math.round((entries + Number.EPSILON) * 100) / 100,
            exits: Math.round((exits + Number.EPSILON) * 100) / 100,
          });
        }
      } catch (error) {
        console.error('Error loading previous balance:', error);
        if (requestId === previousBalanceRequestRef.current) {
          setPreviousBalance(0);
          setMonthTotals({ entries: 0, exits: 0 });
        }
      }
    };

    void loadPreviousBalance();
  }, [accounts, filters.month, filters.year, organizationId, transactions]);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [backupProgress, setBackupProgress] = useState<string | null>(null);
  const ofxInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const catalogImportRef = useRef<HTMLInputElement>(null);
  const loadRequestRef = useRef(0);
  const [excelReviewOpen, setExcelReviewOpen] = useState(false);
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [importExisting, setImportExisting] = useState<Transaction[] | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleOfxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { content, legacyContent } = await readOfxFile(file);
    await handleFileSelect(content, file.name, legacyContent);
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

      const toUpsert = rows.map(r => ({
        date: r.date,
        amount: r.amount,
        description: r.description,
        memo: r.memo || null,
        category_id: r.category_id || null,
        account_id: r.account_id || null,
        chart_account_id: r.chart_account_id || null,
        is_transfer: r._is_transfer || false,
        _update_id: r._update_id || null,
        ...(r._fit_id ? { fit_id: r._fit_id, type: r._type } : {}),
      }));

      // Never deletes: existing rows (same FITID or marked to update) are updated
      // in place and their attachment_url is preserved.
      const { inserted, updated, skipped = 0 } = await upsertTransactionsByFitId(toUpsert);

      setExcelReviewOpen(false);
      setImportExisting(null);
      await fetchCategories();
      const firstRow = rows[0];
      const sameAccount = firstRow?.account_id && rows.every(row => row.account_id === firstRow.account_id);
      const sameMonth = firstRow && rows.every(row => row.date.slice(0, 7) === firstRow.date.slice(0, 7));
      if (firstRow && sameMonth) {
        const [year, month] = firstRow.date.split('-').map(Number);
        setFilters(current => ({
          ...current,
          day: undefined,
          year,
          month,
          account_id: sameAccount ? firstRow.account_id || undefined : current.account_id,
        }));
      } else {
        await loadTransactions();
      }
      const successMessage = `${inserted} transações importadas${updated > 0 ? ` e ${updated} atualizadas (anexos, categorias e contas contábeis preservados)` : ''}${skipped > 0 ? `; ${skipped} já existiam e foram ignorados` : ''}.`;
      setNotification({ type: 'success', message: successMessage });
      toast.success(successMessage);
    } catch (error) {
      console.error('Error confirming transaction import:', error);
      const anyError = error as { message?: string; details?: string; hint?: string; code?: string };
      const message = anyError?.message || anyError?.details || anyError?.hint || anyError?.code || '';
      setNotification({ type: 'warning', message: `Erro ao importar transações${message ? `: ${message}` : '.'}` });
      toast.error(`Erro ao importar transações${message ? `: ${message}` : '.'}`, { duration: 10000 });
    }
  };

  const loadTransactions = useCallback(async () => {
    // Nunca consultar sem organização definida: um super admin veria dados de
    // outras organizações enquanto o perfil ainda está carregando.
    if (!organizationId) {
      setTransactions([]);
      return;
    }
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
    if (!organizationId) return;
    const { data } = await supabase.from('categories').select('*').eq('organization_id', organizationId).order('name');
    if (data) setCategories(data as Category[]);
  }, [organizationId]);

  const fetchAccounts = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase.from('accounts').select('*').eq('organization_id', organizationId).order('name');
    if (data) setAccounts(data as Account[]);
  }, [organizationId]);

  const fetchChartAccounts = useCallback(async () => {
    if (!organizationId) return;
    // Inclui o plano de contas compartilhado da organização master
    const { data: masterId } = await supabase.rpc('get_master_org_id');
    const orgIds = masterId && masterId !== organizationId ? [organizationId, masterId] : [organizationId];
    const { data } = await supabase.from('chart_accounts').select('*').in('organization_id', orgIds).order('code');
    if (data) {
      // Remove duplicados por código (mantém o da própria organização)
      const seen = new Map<string, ChartAccount>();
      for (const ca of data as ChartAccount[]) {
        const key = `${ca.code}|${ca.name}`;
        const existing = seen.get(key);
        if (!existing || (ca as any).organization_id === organizationId) seen.set(key, ca);
      }
      setChartAccounts(Array.from(seen.values()));
    }
  }, [organizationId]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const loadInstallmentSummary = useCallback(async () => {
    try {
      const unpaid = await fetchInstallments(organizationId, undefined, false);
      const paid = await fetchInstallments(organizationId, undefined, true);
      setInstallmentSummary(getInstallmentSummary(unpaid));
      // Combine all (fetchInstallments with showPaid=true returns both paid + unpaid)
      setAllInstallments(paid);
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

  const handleFileSelect = async (content: string, fileName: string, legacyContent?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNotification({ type: 'warning', message: 'Usuário não autenticado.' });
        return;
      }

      const data = parseOFX(content, legacyContent);
      if (data.transactions.length === 0) {
        setNotification({ type: 'warning', message: 'Nenhuma transação encontrada no arquivo.' });
        return;
      }

      // Organização do usuário logado — toda a importação fica presa a ela
      const { data: orgIdData } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
      if (!orgIdData) {
        setNotification({ type: 'warning', message: 'Organização do usuário não encontrada. Faça login novamente.' });
        return;
      }

      // Auto-create or find account from OFX bank info (sempre dentro da organização do usuário)
      let accountId: string | null = null;
      if (data.bankId || data.accountId) {
        const accountName = [data.bankId, data.accountId].filter(Boolean).join(' - ');
        const { data: existing } = await supabase
          .from('accounts')
          .select('id')
          .eq('organization_id', orgIdData as string)
          .eq('name', accountName)
          .maybeSingle();

        if (existing) {
          accountId = existing.id;
        } else {
          const { data: created } = await supabase
            .from('accounts')
            .insert({ name: accountName, user_id: user.id, organization_id: orgIdData as string })
            .select('id')
            .single();
          if (created) {
            accountId = created.id;
            await fetchAccounts();
          }
        }
      }

      // Fetch existing fit_ids for THIS account only (duplicatas de outras contas não contam)
      let allFitIds: string[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        let q = supabase.from('transactions').select('fit_id')
          .eq('organization_id', orgIdData as string)
          .range(from, from + PAGE - 1);
        if (accountId) q = q.eq('account_id', accountId);

        const { data: page } = await q;
        if (!page || page.length === 0) break;
        allFitIds = allFitIds.concat(page.map(t => t.fit_id).filter(Boolean) as string[]);
        if (page.length < PAGE) break;
        from += PAGE;
      }
      const existingFitIds = new Set(allFitIds);


      // Only drop rows that repeat the very same FITID inside the file.
      // Bancos lançam com frequência dois pagamentos idênticos no mesmo dia
      // (mesmo valor/descrição), e esses lançamentos são reais — não podem
      // ser descartados, senão o saldo do extrato fica errado.
      const seenIds = new Set<string>();
      const batchUnique = data.transactions.filter(t => {
        const id = String(t.id);
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });


      // Rows already in the DB (exact same composite fit_id) are flagged, not discarded
      const alreadyInDb = batchUnique.filter(t => existingFitIds.has(t.id)).length;
      const uniqueByFitId = batchUnique;

      if (uniqueByFitId.length === 0) {
        setNotification({ type: 'warning', message: `Nenhuma transação encontrada no arquivo.` });
        return;
      }


      // Auto-categorize transactions
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { transferCategoryId, investmentIncomeCategoryId, tithesOfferingsCategoryId } = await ensureSystemCategories(currentUser!.id);

      // Fetch registered contacts for OFX auto-identification (debits only)
      const contacts = await fetchContacts(orgIdData as any);

      // Convert to ExcelRow format and open review dialog for duplicate detection
      const rows: ExcelRow[] = uniqueByFitId.map(t => {
        const classification = classifyTransaction(`${t.description} ${t.memo || ''}`, t.amount, transferCategoryId, investmentIncomeCategoryId, tithesOfferingsCategoryId);
        const matched = matchContactForOfxTx(t, contacts);
        const description = matched ? `PIX: ${matched.nome}` : t.description;
        const categoryId = matched?.categoria_id || classification.category_id;
        return {
          date: t.date,
          amount: t.amount,
          description,
          memo: t.memo || undefined,
          category_id: categoryId,
          account_id: accountId,
          chart_account_id: null,
          _fit_id: t.id,
          _type: t.type,
          _is_transfer: classification.is_transfer,
          _auto_identified: !!matched,
          _matched_contact_name: matched?.nome,
        };
      });

      // Load existing transactions covering the file's date range so duplicate
      // detection works even when the screen is filtered to another month
      const dates = rows.map(r => r.date).filter(Boolean).sort();
      if (dates.length > 0) {
        const { data: rangeTx } = await supabase
          .from('transactions')
          .select('*')
          .eq('organization_id', orgIdData as string)
          .gte('date', dates[0])
          .lte('date', dates[dates.length - 1]);

        setImportExisting((rangeTx || []) as any);
      } else {
        setImportExisting(null);
      }

      setExcelRows(rows);
      setExcelReviewOpen(true);

      if (alreadyInDb > 0) {
        setNotification({ type: 'warning', message: `${alreadyInDb} de ${rows.length} lançamentos já existem no sistema e vieram desmarcados. Revise e confirme.` });
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
    let withAttachments = 0;
    try { withAttachments = await countAllAttachments(); } catch {}
    const protectionMessage = withAttachments > 0
      ? `\n\n${withAttachments} lançamento(s) com anexo serão PROTEGIDOS e permanecerão no sistema. Ao reimportar os OFXs, eles serão atualizados sem perder o anexo.`
      : '';
    if (!confirm(`⚠️ ATENÇÃO: Isso vai remover permanentemente os lançamentos sem anexo.${protectionMessage}\n\nDeseja continuar?`)) return;
    const typed = prompt('Para confirmar, digite a palavra "APAGAR" abaixo:');
    if (typed?.trim().toUpperCase() !== 'APAGAR') {
      setNotification({ type: 'warning', message: 'Operação cancelada. A palavra digitada não confere.' });
      return;
    }
    const removed = await clearTransactions();
    await loadTransactions();
    setNotification({
      type: 'success',
      message: `${removed} lançamento(s) sem anexo removido(s). ${withAttachments} lançamento(s) com anexo preservado(s) para conciliação na reimportação.`,
    });
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
    is_transfer?: boolean;
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
              {userEmail && (
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  Conectado como <span className="font-medium text-foreground">{userEmail}</span>
                  {organization?.name ? ` · ${organization.name}` : ''}
                </p>
              )}
            </div>

          </div>
          {/* Desktop buttons */}
          <div className="hidden lg:flex items-center gap-2 flex-wrap justify-end">
            {permissions.can_create_transactions && (
              <Button size="sm" onClick={() => { setEditingTransaction(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
                <Plus className="w-4 h-4 mr-1.5" />
                Lançamento
              </Button>
            )}
            {permissions.can_create_transactions && (
              <TransferDialog accounts={accounts} categories={categories} onDone={() => { fetchAccounts(); loadTransactions(); }} />
            )}
            {permissions.can_manage_accounts && (
              <AccountsManager accounts={accounts} onAccountsChange={() => { fetchAccounts(); loadTransactions(); loadInstallmentSummary(); }} transactions={transactions} installments={allInstallments} />
            )}
            {permissions.can_view_totals && accounts.length > 0 && (
              <AccountBalancesSheet accounts={accounts} transactions={transactions} installments={allInstallments} onAccountsChange={() => { fetchAccounts(); loadTransactions(); }} />
            )}
            {permissions.can_manage_categories && (
              <CategoriesManager categories={categories} onCategoriesChange={fetchCategories} />
            )}
            {permissions.can_manage_categories && (
              <ContactsManager categories={categories} />
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
                      <div className="px-1 pb-1">
                        <MonthlySummaryDialog
                          categories={categories}
                          chartAccounts={chartAccounts}
                          organizationId={organizationId}
                          orgName={organization?.name}
                          onSuccess={() => setNotification({ type: 'success', message: 'Resumo mensal exportado!' })}
                          onError={() => setNotification({ type: 'warning', message: 'Erro ao exportar resumo.' })}
                        />
                      </div>
                      <div className="px-1 pb-1">
                        <SendToAccountantDialog />
                      </div>
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
          <div className="lg:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-6">
                  {permissions.can_create_transactions && (
                    <Button onClick={() => { setMobileMenuOpen(false); setEditingTransaction(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 justify-start">
                      <Plus className="w-4 h-4 mr-2" />
                      Novo Lançamento
                    </Button>
                  )}

                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-2">Cadastros</p>
                  {permissions.can_create_transactions && (
                    <div className="[&>button]:w-full [&>button]:justify-start"><TransferDialog accounts={accounts} categories={categories} onDone={() => { fetchAccounts(); loadTransactions(); }} /></div>
                  )}
                  {permissions.can_manage_accounts && (
                    <div className="[&>button]:w-full [&>button]:justify-start"><AccountsManager accounts={accounts} onAccountsChange={() => { fetchAccounts(); loadTransactions(); loadInstallmentSummary(); }} transactions={transactions} installments={allInstallments} /></div>
                  )}
                  {permissions.can_view_totals && accounts.length > 0 && (
                    <div className="[&>button]:w-full [&>button]:justify-start">
                      <AccountBalancesSheet
                        accounts={accounts}
                        transactions={transactions}
                        installments={allInstallments}
                        onOpen={() => setMobileMenuOpen(false)}
                        onAccountsChange={() => { fetchAccounts(); loadTransactions(); }}

                        trigger={
                          <Button variant="outline" className="justify-start">
                            <Wallet className="w-4 h-4 mr-2 text-primary" />
                            Saldo de Contas
                          </Button>
                        }
                      />
                    </div>
                  )}
                  {permissions.can_manage_categories && (
                    <div className="[&>button]:w-full [&>button]:justify-start"><CategoriesManager categories={categories} onCategoriesChange={fetchCategories} /></div>
                  )}
                  {permissions.can_manage_categories && (
                    <div className="[&>button]:w-full [&>button]:justify-start"><ContactsManager categories={categories} /></div>
                  )}
                  {permissions.can_manage_chart_accounts && (
                    <div className="[&>button]:w-full [&>button]:justify-start"><ChartAccountsManager chartAccounts={chartAccounts} onChartAccountsChange={fetchChartAccounts} /></div>
                  )}

                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-2">Importações e Exportações</p>
                  {permissions.can_import && (
                    <>
                      <Button variant="outline" onClick={() => { setMobileMenuOpen(false); ofxInputRef.current?.click(); }} className="justify-start">
                        <Upload className="w-4 h-4 mr-2 text-slate-600" />
                        Importar OFX
                      </Button>
                      <Button variant="outline" onClick={() => { setMobileMenuOpen(false); xlsxInputRef.current?.click(); }} className="justify-start">
                        <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                        Importar Excel
                      </Button>
                      <Button variant="outline" onClick={() => { setMobileMenuOpen(false); downloadExcelTemplate(); }} className="justify-start">
                        <Download className="w-4 h-4 mr-2 text-muted-foreground" />
                        Baixar Modelo Excel
                      </Button>
                    </>
                  )}
                  {permissions.can_export && (
                    <>
                      <div className="[&>button]:w-full [&>button]:justify-start">
                        <ExportDialog transactions={transactions} categories={categories} accounts={accounts} chartAccounts={chartAccounts} />
                      </div>
                      <div className="[&>button]:w-full [&>button]:justify-start">
                        <MonthlySummaryDialog
                          categories={categories}
                          chartAccounts={chartAccounts}
                          organizationId={organizationId}
                          orgName={organization?.name}
                          onSuccess={() => setNotification({ type: 'success', message: 'Resumo mensal exportado!' })}
                          onError={() => setNotification({ type: 'warning', message: 'Erro ao exportar resumo.' })}
                        />
                      </div>
                      <div className="[&>button]:w-full [&>button]:justify-start">
                        <SendToAccountantDialog />
                      </div>
                    </>

                  )}
                  {(permissions.can_manage_categories || permissions.can_manage_chart_accounts) && (
                    <>
                      <Button variant="outline" onClick={() => { setMobileMenuOpen(false); exportCategoriesAndChartAccounts(categories, chartAccounts); }} className="justify-start">
                        <FolderDown className="w-4 h-4 mr-2 text-violet-600" />
                        Exportar Categorias
                      </Button>
                      <Button variant="outline" onClick={() => { setMobileMenuOpen(false); exportCategoriesAndChartAccounts(categories, chartAccounts); }} className="justify-start">
                        <FolderDown className="w-4 h-4 mr-2 text-amber-600" />
                        Exportar Plano de Contas
                      </Button>
                      <Button variant="outline" onClick={() => { setMobileMenuOpen(false); catalogImportRef.current?.click(); }} className="justify-start">
                        <FolderUp className="w-4 h-4 mr-2 text-violet-500" />
                        Importar Cadastros
                      </Button>
                    </>
                  )}

                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-2">Sistema</p>
                  {permissions.can_backup && (
                    <Button
                      variant="outline"
                      disabled={!!backupProgress}
                      onClick={async () => {
                        setMobileMenuOpen(false);
                        try {
                          await createFullBackup(setBackupProgress);
                          setNotification({ type: 'success', message: 'Backup gerado com sucesso!' });
                        } catch {
                          setNotification({ type: 'warning', message: 'Erro ao gerar backup.' });
                        } finally {
                          setBackupProgress(null);
                        }
                      }}
                      className="justify-start"
                      title="Backup completo (ZIP com dados + anexos)"
                    >
                      <HardDrive className="w-4 h-4 mr-2" />
                      {backupProgress || 'Backup'}
                    </Button>
                  )}
                  {permissions.can_clear_all && transactions.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => { setMobileMenuOpen(false); handleClear(); }}
                      className="text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20 justify-start"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Limpar Tudo
                    </Button>
                  )}
                  {(isOwner || isSuperAdmin) && onOpenOrgSettings && (
                    <Button
                      variant="outline"
                      onClick={() => { setMobileMenuOpen(false); onOpenOrgSettings(); }}
                      className="text-primary border-primary/30 justify-start"
                    >
                      <Building className="w-4 h-4 mr-2" />
                      Empresa
                    </Button>
                  )}
                  {isSuperAdmin && onOpenAdmin && (
                    <Button
                      variant="outline"
                      onClick={() => { setMobileMenuOpen(false); onOpenAdmin(); }}
                      className="text-primary border-primary/30 justify-start"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  )}
                  <div className="[&>button]:w-full [&>button]:justify-start">
                    <ChangePasswordDialog />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                    className="text-muted-foreground hover:text-destructive justify-start"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

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
          const totalReceber = monthTotals.entries;
          const totalPagar = monthTotals.exits;
          const saldo = Math.round((previousBalance + totalReceber - totalPagar + Number.EPSILON) * 100) / 100;
          const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const showScopeNotice = Boolean(filters.account_id || filters.day);
          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-2">
                <div className="rounded-xl border p-4 bg-muted/40">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Saldo Anterior</p>
                  <p className="text-xl font-bold">{fmt(previousBalance)}</p>
                </div>
                <div className="rounded-xl border p-4 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800">
                  <p className="text-xs font-medium text-muted-foreground mb-1">+ Entradas</p>
                  <p className="text-xl font-bold text-teal-600">{fmt(totalReceber)}</p>
                </div>
                <div className="rounded-xl border p-4 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800">
                  <p className="text-xs font-medium text-muted-foreground mb-1">− Saídas</p>
                  <p className="text-xl font-bold text-rose-600">{fmt(totalPagar)}</p>
                </div>
                <div className={`rounded-xl border p-4 ${saldo >= 0 ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' : 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'}`}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">= Sub total</p>
                  <p className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(saldo)}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-6 min-h-[1em]">
                {showScopeNotice ? 'Sub total considera o mês inteiro, todas as contas.' : ''}
              </p>


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
        <Tabs value={mainTab} onValueChange={v => setMainTab(v as 'transactions' | 'installments' | 'investments')} className="space-y-4">
          <TabsList>
            <TabsTrigger value="transactions">Lançamentos</TabsTrigger>
            <TabsTrigger value="installments">
              <Receipt className="w-4 h-4 mr-1.5" />
              Contas a Pagar/Receber
            </TabsTrigger>
            <TabsTrigger value="investments">
              💰 Investimentos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'payable' | 'receivable')} className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="payable">A Pagar</TabsTrigger>
                  <TabsTrigger value="receivable">A Receber</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2 flex-wrap">
                  {permissions.can_export && (
                    <ExportDialog
                      source="current"
                      transactions={transactions}
                      categories={categories}
                      accounts={accounts}
                      chartAccounts={chartAccounts}
                      fileName={`lancamentos_${filters.year ?? 'todos'}_${filters.month ?? 'todos'}.xlsx`}
                    />
                  )}
                  <TransactionFiltersComponent filters={filters} onChange={setFilters} categories={categories} accounts={accounts} />
                </div>
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

          <TabsContent value="investments">
            <InvestmentsTab transactions={effectiveTransactions} accounts={accounts} installments={allInstallments} />
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
          existingTransactions={importExisting ?? transactions}
          onConfirm={handleExcelConfirm}
        />
      </div>
    </div>
  );
};

export default Index;
