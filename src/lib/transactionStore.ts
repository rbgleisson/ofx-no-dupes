import { supabase } from '@/integrations/supabase/client';

export interface Transaction {
  id: string;
  fit_id?: string | null;
  type?: string | null;
  date: string;
  amount: number;
  description: string;
  memo?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  attachment_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  total: number;
}

export interface TransactionFilters {
  day?: number;
  month?: number;
  year?: number;
  category_id?: string;
  account_id?: string;
}

export async function fetchTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  let query = supabase.from('transactions').select('*').order('date', { ascending: false });

  if (filters?.year) {
    const startDate = new Date(filters.year, (filters.month ?? 1) - 1, filters.day ?? 1);
    let endDate: Date;

    if (filters.day && filters.month) {
      endDate = new Date(filters.year, filters.month - 1, filters.day + 1);
    } else if (filters.month) {
      endDate = new Date(filters.year, filters.month, 1);
    } else {
      endDate = new Date(filters.year + 1, 0, 1);
    }

    query = query.gte('date', startDate.toISOString().split('T')[0])
                 .lt('date', endDate.toISOString().split('T')[0]);
  }

  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }

  if (filters?.account_id) {
    query = query.eq('account_id', filters.account_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Transaction[];
}

export async function importTransactions(
  newTransactions: { fit_id: string; type: string; date: string; amount: number; description: string; memo?: string; account_id?: string | null }[]
): Promise<ImportResult> {
  // Get existing fit_ids
  const { data: existing } = await supabase.from('transactions').select('fit_id');
  const existingIds = new Set((existing || []).map(t => t.fit_id).filter(Boolean));

  const unique = newTransactions.filter(t => !existingIds.has(t.fit_id));

  if (unique.length > 0) {
    const { error } = await supabase.from('transactions').insert(unique);
    if (error) throw error;
  }

  return {
    imported: unique.length,
    duplicates: newTransactions.length - unique.length,
    total: (existing?.length || 0) + unique.length,
  };
}

export async function addTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<Transaction> {
  const { data, error } = await supabase.from('transactions').insert(tx).select().single();
  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const { error } = await supabase.from('transactions').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function clearTransactions(): Promise<void> {
  const { error } = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}
