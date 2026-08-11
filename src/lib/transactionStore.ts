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
  is_verified?: boolean;
  organization_id?: string | null;
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

async function getOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!data) throw new Error('No organization found');
  return data as string;
}

export async function fetchTransactions(filters?: TransactionFilters, organizationId?: string | null): Promise<Transaction[]> {
  const buildQuery = () => {
    let query = supabase.from('transactions').select('*').order('date', { ascending: false }).order('id', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

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

    return query;
  };

  // Paginate to bypass the 1000-row API cap so annual / all-time totals are complete
  const pageSize = 1000;
  const all: any[] = [];
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  return all.map(normalizeTransaction);
}

export async function importTransactions(
  newTransactions: { fit_id: string; type: string; date: string; amount: number; description: string; memo?: string; account_id?: string | null }[]
): Promise<ImportResult> {
  const userId = await getUserId();
  const orgId = await getOrgId();
  const { data: existing } = await supabase.from('transactions').select('fit_id').eq('organization_id', orgId);
  const existingIds = new Set((existing || []).map(t => t.fit_id).filter(Boolean));

  const unique = newTransactions.filter(t => !existingIds.has(t.fit_id));

  if (unique.length > 0) {
    const withIds = unique.map(t => ({ ...t, user_id: userId, organization_id: orgId }));
    const { error } = await supabase.from('transactions').insert(withIds);
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
  const orgId = await getOrgId();
  const { data, error } = await supabase.from('transactions').insert({ ...tx, user_id: userId, organization_id: orgId }).select().single();
  if (error) throw error;
  return data as Transaction;
}

export async function addTransactionsBulk(txs: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<number> {
  if (txs.length === 0) return 0;
  const userId = await getUserId();
  const orgId = await getOrgId();
  const rows = txs.map(tx => ({ ...tx, user_id: userId, organization_id: orgId }));
  
  // Insert in batches of 100 to avoid payload limits
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('transactions').insert(batch);
    if (error) throw error;
    inserted += batch.length;
  }
  return inserted;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const { error } = await supabase.from('transactions').update(updates).eq('id', id);
  if (error) throw error;
  if ('attachment_url' in updates) {
    await syncAttachmentLink(id, updates.attachment_url ?? null);
  }
}

/**
 * Keeps a permanent FITID -> attachment link so a future re-import can restore
 * the document even if the transaction row was deleted in between.
 */
export async function syncAttachmentLink(transactionId: string, url: string | null): Promise<void> {
  const { data } = await supabase
    .from('transactions')
    .select('fit_id, account_id, organization_id')
    .eq('id', transactionId)
    .maybeSingle();
  if (!data?.fit_id || !data.organization_id) return;

  const base = () => {
    let q = supabase
      .from('attachment_links')
      .select('id')
      .eq('organization_id', data.organization_id!)
      .eq('fit_id', data.fit_id!);
    return data.account_id ? q.eq('account_id', data.account_id) : q.is('account_id', null);
  };

  const { data: existing } = await base().maybeSingle();

  if (url) {
    if (existing) {
      await supabase.from('attachment_links').update({ attachment_url: url }).eq('id', existing.id);
    } else {
      await supabase.from('attachment_links').insert({
        organization_id: data.organization_id,
        account_id: data.account_id,
        fit_id: data.fit_id,
        attachment_url: url,
      });
    }
  } else if (existing) {
    await supabase.from('attachment_links').delete().eq('id', existing.id);
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function clearTransactions(): Promise<number> {
  // Transactions with attachments are intentionally retained. A later OFX
  // import updates these rows by FITID, preserving both their internal id and
  // attachment_url instead of orphaning the stored document.
  const { data, error } = await supabase
    .from('transactions')
    .delete()
    .is('attachment_url', null)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Fields that a re-import may legitimately refresh on an existing transaction. */
type UpsertRow = {
  fit_id?: string | null;
  type?: string | null;
  date: string;
  amount: number;
  description: string;
  memo?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  chart_account_id?: string | null;
  is_transfer?: boolean;
  /** When set, this specific existing transaction is updated instead of inserted. */
  _update_id?: string | null;
};

export interface UpsertResult {
  inserted: number;
  updated: number;
}

/**
 * Imports transactions without ever deleting existing rows.
 * A row whose fit_id already exists (or that points at an explicit _update_id)
 * updates the existing transaction. `attachment_url` is NEVER written here, so
 * attachments already linked are always preserved.
 */
export async function upsertTransactionsByFitId(rows: UpsertRow[]): Promise<UpsertResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const userId = await getUserId();
  const orgId = await getOrgId();

  // Map existing fit_id -> candidates for this organization
  const existingMap = new Map<string, { id: string; account_id: string | null }[]>();
  const existingById = new Map<string, { category_id: string | null; chart_account_id: string | null }>();
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, fit_id, account_id, category_id, chart_account_id')
      .eq('organization_id', orgId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    page.forEach(t => {
      if (t.fit_id) {
        const list = existingMap.get(t.fit_id) || [];
        list.push({ id: t.id, account_id: t.account_id });
        existingMap.set(t.fit_id, list);
      }
      existingById.set(t.id, { category_id: t.category_id, chart_account_id: t.chart_account_id });
    });
    if (page.length < pageSize) break;
  }

  const findExisting = (fitId?: string | null, accountId?: string | null): string | undefined => {
    if (!fitId) return undefined;
    const list = existingMap.get(fitId);
    if (!list || list.length === 0) return undefined;
    if (accountId) {
      // Only reuse a row from the SAME account; otherwise insert a new one
      return list.find(c => c.account_id === accountId)?.id;
    }
    return list[0].id;
  };

  const toInsert: any[] = [];
  const toUpdate: { id: string; values: any }[] = [];

  for (const row of rows) {
    const { _update_id, ...rest } = row;
    const targetId = _update_id || findExisting(rest.fit_id, rest.account_id ?? null);

    if (targetId) {
      // attachment_url intentionally omitted — never overwritten by an import
      // categoria e conta contábil já preenchidas são preservadas
      const prev = existingById.get(targetId);
      toUpdate.push({
        id: targetId,
        values: {
          date: rest.date,
          amount: rest.amount,
          description: rest.description,
          memo: rest.memo ?? null,
          category_id: rest.category_id ?? prev?.category_id ?? null,
          account_id: rest.account_id ?? null,
          chart_account_id: rest.chart_account_id ?? prev?.chart_account_id ?? null,
          is_transfer: rest.is_transfer ?? false,
          ...(rest.type ? { type: rest.type } : {}),
        },
      });

    } else {
      toInsert.push({ ...rest, user_id: userId, organization_id: orgId });
    }
  }

  const batchSize = 100;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const { error } = await supabase.from('transactions').insert(toInsert.slice(i, i + batchSize));
    if (error) throw error;
  }

  for (const u of toUpdate) {
    const { error } = await supabase.from('transactions').update(u.values).eq('id', u.id);
    if (error) throw error;
  }

  return { inserted: toInsert.length, updated: toUpdate.length };
}

/** Returns how many of the given transaction ids currently have an attachment linked. */
export async function countAttachments(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  let total = 0;
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, attachment_url')
      .in('id', ids.slice(i, i + chunk));
    if (error) throw error;
    total += (data || []).filter(t => !!t.attachment_url).length;
  }
  return total;
}

/** Counts all transactions of the current organization that have an attachment linked. */
export async function countAllAttachments(): Promise<number> {
  const orgId = await getOrgId();
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .not('attachment_url', 'is', null);
  if (error) throw error;
  return count || 0;
}
