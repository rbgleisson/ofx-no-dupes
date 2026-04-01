import { supabase } from '@/integrations/supabase/client';

export interface Installment {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  group_id: string;
  description: string;
  invoice_number: string | null;
  type: 'payable' | 'receivable';
  installment_number: number;
  total_installments: number;
  amount: number;
  due_date: string;
  is_paid: boolean;
  paid_at: string | null;
  transaction_id: string | null;
  category_id: string | null;
  account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

async function getAuthInfo() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!orgId) throw new Error('No organization found');
  return { userId: user.id, orgId: orgId as string };
}

export async function fetchInstallments(
  organizationId?: string | null,
  type?: 'payable' | 'receivable',
  showPaid?: boolean
): Promise<Installment[]> {
  let query = supabase.from('installments').select('*').order('due_date', { ascending: true });
  if (organizationId) query = query.eq('organization_id', organizationId);
  if (type) query = query.eq('type', type);
  if (!showPaid) query = query.eq('is_paid', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Installment[];
}

export async function createInstallments(params: {
  description: string;
  invoice_number?: string;
  type: 'payable' | 'receivable';
  total_amount: number;
  num_installments: number;
  first_due_date: string;
  category_id?: string | null;
  account_id?: string | null;
  notes?: string;
  custom_amounts?: { amount: number; due_date: string }[];
}): Promise<Installment[]> {
  const { userId, orgId } = await getAuthInfo();
  const groupId = crypto.randomUUID();

  let rows: any[];

  if (params.custom_amounts && params.custom_amounts.length > 0) {
    rows = params.custom_amounts.map((item, i) => ({
      group_id: groupId,
      organization_id: orgId,
      user_id: userId,
      description: params.description,
      invoice_number: params.invoice_number || null,
      type: params.type,
      installment_number: i + 1,
      total_installments: params.custom_amounts!.length,
      amount: item.amount,
      due_date: item.due_date,
      category_id: params.category_id || null,
      account_id: params.account_id || null,
      notes: params.notes || null,
    }));
  } else {
    const perInstallment = Math.round((params.total_amount / params.num_installments) * 100) / 100;
    const remainder = Math.round((params.total_amount - perInstallment * params.num_installments) * 100) / 100;

    rows = Array.from({ length: params.num_installments }, (_, i) => {
      const dueDate = new Date(params.first_due_date + 'T12:00:00Z');
      dueDate.setUTCMonth(dueDate.getUTCMonth() + i);
      const y = dueDate.getUTCFullYear();
      const m = String(dueDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dueDate.getUTCDate()).padStart(2, '0');

      return {
        group_id: groupId,
        organization_id: orgId,
        user_id: userId,
        description: params.description,
        invoice_number: params.invoice_number || null,
        type: params.type,
        installment_number: i + 1,
        total_installments: params.num_installments,
        amount: i === 0 ? perInstallment + remainder : perInstallment,
        due_date: `${y}-${m}-${d}`,
        category_id: params.category_id || null,
        account_id: params.account_id || null,
        notes: params.notes || null,
      };
    });
  }

  const { data, error } = await supabase.from('installments').insert(rows).select();
  if (error) throw error;
  return (data || []) as Installment[];
}

export async function payInstallment(installment: Installment): Promise<void> {
  const { userId, orgId } = await getAuthInfo();

  // Create transaction
  const txData = {
    date: new Date().toISOString().split('T')[0],
    amount: installment.type === 'payable' ? -Math.abs(installment.amount) : Math.abs(installment.amount),
    description: `${installment.description} (${installment.installment_number}/${installment.total_installments})`,
    category_id: installment.category_id,
    account_id: installment.account_id,
    user_id: userId,
    organization_id: orgId,
    memo: installment.invoice_number ? `NF: ${installment.invoice_number}` : null,
  };

  const { data: tx, error: txError } = await supabase.from('transactions').insert(txData).select('id').single();
  if (txError) throw txError;

  // Mark as paid
  const { error } = await supabase.from('installments').update({
    is_paid: true,
    paid_at: new Date().toISOString(),
    transaction_id: tx.id,
  }).eq('id', installment.id);
  if (error) throw error;
}

export async function unpayInstallment(installment: Installment): Promise<void> {
  // Delete the linked transaction if exists
  if (installment.transaction_id) {
    await supabase.from('transactions').delete().eq('id', installment.transaction_id);
  }
  const { error } = await supabase.from('installments').update({
    is_paid: false,
    paid_at: null,
    transaction_id: null,
  }).eq('id', installment.id);
  if (error) throw error;
}

export async function updateInstallment(id: string, updates: Partial<Installment>): Promise<void> {
  const { error } = await supabase.from('installments').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteInstallmentGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('installments').delete().eq('group_id', groupId);
  if (error) throw error;
}

export async function deleteInstallment(id: string): Promise<void> {
  const { error } = await supabase.from('installments').delete().eq('id', id);
  if (error) throw error;
}

export function getInstallmentSummary(installments: Installment[]) {
  const payable = installments.filter(i => i.type === 'payable' && !i.is_paid);
  const receivable = installments.filter(i => i.type === 'receivable' && !i.is_paid);
  return {
    totalPayable: payable.reduce((s, i) => s + Number(i.amount), 0),
    totalReceivable: receivable.reduce((s, i) => s + Number(i.amount), 0),
    countPayable: payable.length,
    countReceivable: receivable.length,
  };
}
