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
  updateTransaction,
  ImportResult,
} from '@/lib/transactionStore';
import { supabase } from '@/integrations/supabase/client';

import TransactionTable from '@/components/TransactionTable';
import TransactionFiltersComponent from '@/components/TransactionFilters';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import CategoriesManager, { Category } from '@/components/CategoriesManager';
import AccountsManager, { Account } from '@/components/AccountsManager';
import ChartAccountsManager, { ChartAccount } from '@/components/ChartAccountsManager';
import ExportDialog from '@/components/ExportDialog';
import { Trash2, FileText, CheckCircle2, AlertCircle, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Index = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [activeTab, setActiveTab] = useState<'payable' | 'receivable'>('payable');
  const [notification, setNotification] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const ofxInputRef = useRef<HTMLInputElement>(null);

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

  const loadTransactions = useCallback(async () => {
    try {
      const data = await fetchTransactions(filters);
      setTransactions(data);
    } catch (err) {
      console.error('Error loading transactions:', err);
    }
  }, [filters]);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    if (data) setCategories(data as Category[]);
  }, []);

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase.from('accounts').select('*').order('name');
    if (data) setAccounts(data as Account[]);
  }, []);

  const fetchChartAccounts = useCallback(async () => {
    const { data } = await supabase.from('chart_accounts').select('*').order('code');
    if (data) setChartAccounts(data as ChartAccount[]);
  }, []);

  useEffect(() => {
    loadTransactions();
    fetchCategories();
    fetchAccounts();
    fetchChartAccounts();
  }, [loadTransactions, fetchCategories, fetchAccounts, fetchChartAccounts]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleFileSelect = async (content: string, fileName: string) => {
    try {
      const data = parseOFX(content);
      if (data.transactions.length === 0) {
        setNotification({ type: 'warning', message: 'Nenhuma transação encontrada no arquivo.' });
        return;
      }

      // Auto-create or find account from OFX bank info
      let accountId: string | null = null;
      if (data.bankId || data.accountId) {
        const accountName = [data.bankId, data.accountId].filter(Boolean).join(' - ');
        // Check if account already exists
        const { data: existing } = await supabase
          .from('accounts')
          .select('id')
          .eq('name', accountName)
          .maybeSingle();

        if (existing) {
          accountId = existing.id;
        } else {
          const { data: created } = await supabase
            .from('accounts')
            .insert({ name: accountName })
            .select('id')
            .single();
          if (created) {
            accountId = created.id;
            await fetchAccounts();
          }
        }
      }

      const mapped = data.transactions.map(t => ({
        fit_id: t.id,
        type: t.type,
        date: t.date,
        amount: t.amount,
        description: t.description,
        memo: t.memo,
        account_id: accountId,
      }));

      const result: ImportResult = await importTransactions(mapped);
      await loadTransactions();

      if (result.duplicates > 0 && result.imported === 0) {
        setNotification({ type: 'warning', message: `Todas as ${result.duplicates} transações já existem.` });
      } else if (result.duplicates > 0) {
        setNotification({ type: 'success', message: `${result.imported} importadas, ${result.duplicates} duplicatas ignoradas.` });
      } else {
        setNotification({ type: 'success', message: `${result.imported} transações importadas de "${fileName}".` });
      }
    } catch {
      setNotification({ type: 'warning', message: 'Erro ao ler o arquivo OFX. Verifique o formato.' });
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

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setFormOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Sistema Financeiro" className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Sistema Financeiro</h1>
              <p className="text-sm text-muted-foreground">Gestão de lançamentos e relatórios</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => { setEditingTransaction(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
              <Plus className="w-4 h-4 mr-1.5" />
              Lançamento
            </Button>
            <AccountsManager accounts={accounts} onAccountsChange={fetchAccounts} />
            <CategoriesManager categories={categories} onCategoriesChange={fetchCategories} />
            <ChartAccountsManager chartAccounts={chartAccounts} onChartAccountsChange={fetchChartAccounts} />
            <ExportDialog transactions={transactions} categories={categories} accounts={accounts} chartAccounts={chartAccounts} />
            <input ref={ofxInputRef} type="file" accept=".ofx,.qfx" onChange={handleOfxFileChange} className="hidden" />
            <Button size="sm" onClick={() => ofxInputRef.current?.click()} className="bg-slate-700 hover:bg-slate-800 text-white border-0">
              <Upload className="w-4 h-4 mr-1.5" />
              Importar OFX
            </Button>
            {transactions.length > 0 && (
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


        {/* Tabs + Filters */}



        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'payable' | 'receivable')} className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <TabsList>
              <TabsTrigger value="payable">A Pagar</TabsTrigger>
              <TabsTrigger value="receivable">A Receber</TabsTrigger>
            </TabsList>
            <TransactionFiltersComponent filters={filters} onChange={setFilters} categories={categories} accounts={accounts} />
          </div>

          {(['payable', 'receivable'] as const).map((tab) => {
            const filtered = transactions.filter(t =>
              tab === 'payable' ? Number(t.amount) < 0 : Number(t.amount) >= 0
            );
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
                    onEditTransaction={handleEditTransaction}
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
      </div>
    </div>
  );
};

export default Index;
