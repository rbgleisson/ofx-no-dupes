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
 * Ensures system categories exist and finds the default income category.
 * Creates "Transferência Interna" and "Receita de Investimento" if needed.
 * For tithes, looks for existing category by name pattern (e.g. "DIZIMOS").
 */
async function ensureSystemCategories(userId: string): Promise<{
  transferCategoryId: string;
  investmentIncomeCategoryId: string;
  tithesOfferingsCategoryId: string | null;
}> {
  // Get org_id for the user
  const { data: orgId } = await supabase.rpc('get_user_org_id', { _user_id: userId });
  if (!orgId) throw new Error('Organização do usuário não encontrada.');

  // Categories to auto-create if missing
  const systemNames = ['Transferência Interna', 'Receita de Investimento'];
  const colors: Record<string, string> = {
    'Transferência Interna': '#9ca3af',
    'Receita de Investimento': '#10b981',
  };

  const result: Record<string, string> = {};

  for (const name of systemNames) {
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('organization_id', orgId as string)
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

  // Find existing tithes/offerings category by name pattern (user's own catalog)
  let tithesId: string | null = null;
  const { data: tithesCategory } = await supabase
    .from('categories')
    .select('id')
    .eq('organization_id', orgId as string)
    .ilike('name', '%dizimo%')
    .maybeSingle();
  if (tithesCategory) {
    tithesId = tithesCategory.id;
  }

  return {
    transferCategoryId: result['Transferência Interna'],
    investmentIncomeCategoryId: result['Receita de Investimento'],
    tithesOfferingsCategoryId: tithesId,
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

  const upper = description
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Same-ownership movements (PIX/TED/transfers between own accounts) are never
  // real income or expense — flag them as internal transfers in both directions.
  const sameOwnership =
    upper.includes('MESMA TIT') ||
    upper.includes('MESMA TITULARIDADE') ||
    upper.includes('PROPRIO') ||
    upper.includes('CONTA PROPRIA') ||
    upper.includes('MSM TIT');
  if (sameOwnership) {
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
