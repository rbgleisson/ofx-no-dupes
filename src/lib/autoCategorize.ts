import { supabase } from '@/integrations/supabase/client';

// Keywords for auto-categorization during OFX import
const TRANSFER_OUT_KEYWORDS = [
  'INVEST', 'APLICAÇÃO', 'APLICACAO', 'RESGATE AUTOMÁTICO', 'RESGATE AUTOMATICO',
  'TRANSFERÊNCIA MESMA TITULARIDADE', 'TRANSFERENCIA MESMA TITULARIDADE',
  'TRANSF MESMA TITULARIDADE',
];

const TRANSFER_IN_KEYWORDS = [
  'RESGATE', 'CRED.TRANSF', 'CRED TRANSF', 'CREDITO TRANSF',
];

const INCOME_KEYWORDS = [
  'RENDIMENTO', 'JUROS SOBRE CAPITAL', 'DIVIDENDOS', 'BONIFICAÇÃO', 'BONIFICACAO',
];

export interface AutoCategorizeResult {
  category_id: string | null;
  is_transfer: boolean;
}

function matchesAny(description: string, keywords: string[]): boolean {
  const upper = description.toUpperCase();
  return keywords.some(kw => upper.includes(kw));
}

/**
 * Ensures categories "Transferência Interna" and "Receita de Investimento" exist
 * for the current user, creating them if needed. Returns their IDs.
 */
async function ensureSystemCategories(userId: string): Promise<{
  transferCategoryId: string;
  investmentIncomeCategoryId: string;
  tithesOfferingsCategoryId: string;
}> {
  // Get org_id for the user
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: userId });

  const names = ['Transferência Interna', 'Receita de Investimento', 'Dízimos e Ofertas'];
  const colors: Record<string, string> = {
    'Transferência Interna': '#9ca3af',
    'Receita de Investimento': '#10b981',
    'Dízimos e Ofertas': '#f59e0b',
  };

  const result: Record<string, string> = {};

  for (const name of names) {
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      result[name] = existing.id;
    } else {
      const { data: created } = await supabase
        .from('categories')
        .insert({ name, color: colors[name], user_id: userId, organization_id: orgId })
        .select('id')
        .single();
      if (created) result[name] = created.id;
    }
  }

  return {
    transferCategoryId: result['Transferência Interna'],
    investmentIncomeCategoryId: result['Receita de Investimento'],
    tithesOfferingsCategoryId: result['Dízimos e Ofertas'],
  };
}

/**
 * Auto-categorizes a transaction based on description + amount.
 */
export function classifyTransaction(
  description: string,
  amount: number,
  transferCategoryId: string,
  investmentIncomeCategoryId: string,
  tithesOfferingsCategoryId?: string
): AutoCategorizeResult {
  if (amount < 0 && matchesAny(description, TRANSFER_OUT_KEYWORDS)) {
    return { category_id: transferCategoryId, is_transfer: true };
  }

  if (amount >= 0 && matchesAny(description, TRANSFER_IN_KEYWORDS)) {
    return { category_id: transferCategoryId, is_transfer: true };
  }

  const upper = description.toUpperCase();
  if (amount < 0 && upper.includes('PIX') && (upper.includes('MESMA TITULARIDADE') || upper.includes('PROPRIO') || upper.includes('PRÓPRIO'))) {
    return { category_id: transferCategoryId, is_transfer: true };
  }

  if (matchesAny(description, INCOME_KEYWORDS)) {
    return { category_id: investmentIncomeCategoryId, is_transfer: false };
  }

  // Default: positive amounts (credits) suggest "Dízimos e Ofertas"
  if (amount > 0 && tithesOfferingsCategoryId) {
    return { category_id: tithesOfferingsCategoryId, is_transfer: false };
  }

  return { category_id: null, is_transfer: false };
}

export { ensureSystemCategories };
