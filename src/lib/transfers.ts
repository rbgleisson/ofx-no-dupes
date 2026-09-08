import { supabase } from '@/integrations/supabase/client';
import { round2 } from '@/lib/accountBalances';

export const DEFAULT_INVESTMENT_ACCOUNT_NAME = 'Aplicação Financeira';

async function currentUserAndOrg() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!orgId) throw new Error('Organização não encontrada.');
  return { userId: user.id, orgId: orgId as string };
}

/**
 * Cria uma conta de aplicação com nome livre (ex.: "RDC Sicoob", "CDB Banco X").
 * Sempre manual (sem OFX) e do tipo investment, isolada por organização.
 */
export async function createInvestmentAccount(params: {
  name: string;
  color?: string;
  openingBalance?: number;
}): Promise<string> {
  const { userId, orgId } = await currentUserAndOrg();
  const name = params.name.trim();
  if (!name) throw new Error('Informe o nome da conta de aplicação.');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      name,
      color: params.color || '#14b8a6',
      opening_balance: round2(Number(params.openingBalance) || 0),
      is_manual: true,
      kind: 'investment',
      user_id: userId,
      organization_id: orgId,
    } as any)
    .select('id')
    .single();
  if (error) throw error;
  return data!.id;
}

/**
 * Garante que exista pelo menos uma conta de aplicação na organização.
 * Não depende de nome fixo: usa qualquer conta kind = 'investment' existente.
 */
export async function ensureInvestmentAccount(): Promise<string> {
  const { orgId } = await currentUserAndOrg();

  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('kind', 'investment')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;
  return createInvestmentAccount({ name: DEFAULT_INVESTMENT_ACCOUNT_NAME });
}


export interface TransferInput {
  date: string;
  amount: number;          // sempre positivo
  fromAccountId: string;
  toAccountId: string;
  description: string;
  memo?: string;
  categoryId?: string | null;
}

/**
 * Cria uma transferência entre contas com duas pernas (débito na origem,
 * crédito no destino), ligadas pelo mesmo transfer_group_id. As duas pernas
 * são marcadas como movimentação interna (is_transfer), portanto não entram
 * em Receitas/Despesas Reais.
 */
export async function createTransfer(input: TransferInput): Promise<void> {
  const { userId, orgId } = await currentUserAndOrg();
  const value = round2(Math.abs(Number(input.amount) || 0));
  if (!value) throw new Error('Informe um valor maior que zero.');
  if (!input.fromAccountId || !input.toAccountId) throw new Error('Selecione as contas de origem e destino.');
  if (input.fromAccountId === input.toAccountId) throw new Error('Origem e destino devem ser contas diferentes.');

  const groupId = crypto.randomUUID();
  const base = {
    date: input.date,
    description: input.description.trim(),
    memo: input.memo?.trim() || null,
    category_id: input.categoryId || null,
    is_transfer: true,
    is_verified: true,
    transfer_group_id: groupId,
    user_id: userId,
    organization_id: orgId,
  };

  const { error } = await supabase.from('transactions').insert([
    { ...base, amount: -value, account_id: input.fromAccountId },
    { ...base, amount: value, account_id: input.toAccountId },
  ] as any);
  if (error) throw error;
}

/**
 * Rendimento de aplicação: crédito direto na conta "Aplicação Financeira".
 * Não é transferência (é ganho real), mas fica isolado na conta de aplicação.
 */
export async function createInvestmentYield(params: {
  date: string;
  amount: number;
  description: string;
  memo?: string;
  categoryId?: string | null;
}): Promise<void> {
  const { userId, orgId } = await currentUserAndOrg();
  const accountId = await ensureInvestmentAccount();
  const value = round2(Math.abs(Number(params.amount) || 0));
  if (!value) throw new Error('Informe um valor maior que zero.');

  const { error } = await supabase.from('transactions').insert({
    date: params.date,
    amount: value,
    description: params.description.trim(),
    memo: params.memo?.trim() || null,
    category_id: params.categoryId || null,
    account_id: accountId,
    is_transfer: false,
    is_verified: true,
    user_id: userId,
    organization_id: orgId,
  } as any);
  if (error) throw error;
}
