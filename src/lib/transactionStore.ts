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
  chart_account_id?: string | null;
  attachment_url?: string | null;
  is_transfer?: boolean;
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
  search?: string;
  amount?: number;
}

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function normalizeTransaction(tx: any): Transaction {
  return {
    ...tx,
    date: typeof tx?.date === 'string' ? tx.date : '',
    amount: Number(tx?.amount ?? 0),
    description: typeof tx?.description === 'string' ? tx.description : '',
    memo: typeof tx?.memo === 'string' ? tx.memo : null,
  } as Transaction;
}

export async function fetchTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  let query = supabase.from('transactions').select('*').order('date', { ascending: false });

  if (filters?.year) {
    const year = filters.year;
    const month = filters.month;
    const day = filters.day;

    let startDate: string;
    let endDate: string;

    if (month && day) {
      const start = new Date(Date.UTC(year, month - 1, day));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      startDate = toYmd(start);
      endDate = toYmd(end);
    } else if (month) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = month === 12
        ? new Date(Date.UTC(year + 1, 0, 1))
        : new Date(Date.UTC(year, month, 1));
      startDate = toYmd(start);
      endDate = toYmd(end);
    } else {
      startDate = `${year}-01-01`;
      endDate = `${year + 1}-01-01`;
    }

    query = query.gte('date', startDate).lt('date', endDate);
  }

  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }

  if (filters?.account_id) {
    query = query.eq('account_id', filters.account_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(normalizeTransaction);
}

export async function importTransactions(
  newTransactions: { fit_id: string; type: string; date: string; amount: number; description: string; memo?: string; account_id?: string | null }[]
): Promise<ImportResult> {
  const userId = await getUserId();
  const { data: existing } = await supabase.from('transactions').select('fit_id');
  const existingIds = new Set((existing || []).map(t => t.fit_id).filter(Boolean));

  const unique = newTransactions.filter(t => !existingIds.has(t.fit_id));

  if (unique.length > 0) {
    const withUserId = unique.map(t => ({ ...t, user_id: userId }));
    const { error } = await supabase.from('transactions').insert(withUserId);
    if (error) throw error;
  }

  return {
    imported: unique.length,
    duplicates: newTransactions.length - unique.length,
    total: (existing?.length || 0) + unique.length,
  };
}

export async function addTransaction(tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<Transaction> {
  const userId = await getUserId();
  const { data, error } = await supabase.from('transactions').insert({ ...tx, user_id: userId }).select().single();
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
