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
  const { error } = await supabase.rpc('set_installment_paid', { _id: installment.id, _paid: true });
  if (error) throw error;
}

export async function unpayInstallment(installment: Installment): Promise<void> {
  const { error } = await supabase.rpc('set_installment_paid', { _id: installment.id, _paid: false });
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
