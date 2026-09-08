import { supabase } from '@/integrations/supabase/client';
import type { Account } from '@/components/AccountsManager';
import { round2 } from '@/lib/accountBalances';

export interface InvestmentPosition {
  id: string;
  organization_id: string;
  account_id: string;
  month: number;
  year: number;
  saldo_anterior: number;
  saldo_atual: number;
  rendimento_mes: number;
  updated_at: string;
}

/** Uma conta é de aplicação quando kind = 'investment'. */
export const isInvestmentAccount = (a: Account) =>
  (a.kind || '').toLowerCase() === 'investment';

const normalize = (r: any): InvestmentPosition => ({
  ...r,
  saldo_anterior: Number(r.saldo_anterior) || 0,
  saldo_atual: Number(r.saldo_atual) || 0,
  rendimento_mes: Number(r.rendimento_mes) || 0,
});

/** Todas as posições de uma conta, mais recentes primeiro. */
export async function fetchPositions(accountId: string): Promise<InvestmentPosition[]> {
  const { data, error } = await supabase
    .from('investment_positions')
    .select('*')
    .eq('account_id', accountId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalize);
}

/** Posições de todas as contas de aplicação da organização. */
export async function fetchOrgPositions(organizationId: string | null): Promise<InvestmentPosition[]> {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from('investment_positions')
    .select('*')
    .eq('organization_id', organizationId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalize);
}

const key = (p: { year: number; month: number }) => p.year * 12 + p.month;

/** Última posição de cada conta (opcionalmente até um mês/ano limite, inclusive). */
export function latestByAccount(
  positions: InvestmentPosition[],
  until?: { year: number; month: number },
): Map<string, InvestmentPosition> {
  const limit = until ? key(until) : Infinity;
  const map = new Map<string, InvestmentPosition>();
  for (const p of positions) {
    if (key(p) > limit) continue;
    const cur = map.get(p.account_id);
    if (!cur || key(p) > key(cur)) map.set(p.account_id, p);
  }
  return map;
}

/** Saldo atual de cada conta de aplicação, a partir da última posição registrada. */
export function balanceMap(
  positions: InvestmentPosition[],
  until?: { year: number; month: number },
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, p] of latestByAccount(positions, until)) out.set(id, p.saldo_atual);
  return out;
}

/** Saldo anterior sugerido: saldo atual do mês imediatamente anterior a este. */
export function previousBalanceFor(
  positions: InvestmentPosition[],
  accountId: string,
  year: number,
  month: number,
): number {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const mine = positions.filter(p => p.account_id === accountId);
  const exact = mine.find(p => p.year === prevYear && p.month === prevMonth);
  if (exact) return exact.saldo_atual;
  const before = mine
    .filter(p => key(p) < key({ year, month }))
    .sort((a, b) => key(b) - key(a))[0];
  return before?.saldo_atual ?? 0;
}

export async function savePosition(params: {
  accountId: string;
  year: number;
  month: number;
  saldoAnterior: number;
  saldoAtual: number;
  rendimentoMes: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: user.id });
  if (!orgId) throw new Error('Organização não encontrada.');

  const { error } = await supabase
    .from('investment_positions')
    .upsert({
      organization_id: orgId as string,
      account_id: params.accountId,
      year: params.year,
      month: params.month,
      saldo_anterior: round2(params.saldoAnterior),
      saldo_atual: round2(params.saldoAtual),
      rendimento_mes: round2(params.rendimentoMes),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'account_id,year,month' });
  if (error) throw error;
}

export interface InvestmentSummary {
  totalSaldo: number;
  totalRendimento: number;
  byAccount: { accountId: string; name: string; saldo: number; rendimento: number }[];
}

/**
 * Consolida saldo e rendimento das contas de aplicação da organização
 * até o mês/ano informado (saldo = última posição registrada até o período;
 * rendimento = rendimento lançado no próprio mês).
 */
export async function fetchInvestmentSummary(
  organizationId: string | null,
  year: number,
  month: number,
): Promise<InvestmentSummary> {
  const empty: InvestmentSummary = { totalSaldo: 0, totalRendimento: 0, byAccount: [] };
  if (!organizationId) return empty;

  const { data: accs } = await supabase
    .from('accounts')
    .select('id, name, kind')
    .eq('organization_id', organizationId)
    .eq('kind', 'investment');

  const accounts = (accs || []) as { id: string; name: string }[];
  if (!accounts.length) return empty;

  const positions = await fetchOrgPositions(organizationId);
  const latest = latestByAccount(positions, { year, month });

  const byAccount = accounts.map(a => {
    const p = latest.get(a.id);
    const monthly = positions.find(x => x.account_id === a.id && x.year === year && x.month === month);
    return {
      accountId: a.id,
      name: a.name,
      saldo: p?.saldo_atual ?? 0,
      rendimento: monthly?.rendimento_mes ?? 0,
    };
  });

  return {
    totalSaldo: round2(byAccount.reduce((s, a) => s + a.saldo, 0)),
    totalRendimento: round2(byAccount.reduce((s, a) => s + a.rendimento, 0)),
    byAccount,
  };
}
