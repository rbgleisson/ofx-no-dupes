import { supabase } from '@/integrations/supabase/client';

export interface MonthClosure {
  organization_id: string;
  year: number;
  month: number;
  closed_by: string;
  closed_at: string;
}

export function canReopenMonth(closure: MonthClosure | null, userId: string | null): boolean {
  return Boolean(closure && userId && closure.closed_by === userId);
}

export async function fetchMonthClosure(organizationId: string, year: number, month: number) {
  const { data, error } = await supabase.from('month_closures').select('*')
    .eq('organization_id', organizationId).eq('year', year).eq('month', month).maybeSingle();
  if (error) throw error;
  return data;
}

export async function setMonthClosed(organizationId: string, year: number, month: number, closed: boolean) {
  const { error } = await supabase.rpc('set_month_closed', {
    _organization_id: organizationId, _year: year, _month: month, _closed: closed,
  });
  if (error) throw error;
}