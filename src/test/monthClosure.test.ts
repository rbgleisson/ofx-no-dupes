import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { canReopenMonth, type MonthClosure } from '@/lib/monthClosure';
const closure: MonthClosure = { organization_id: 'org-a', year: 2026, month: 3, closed_by: 'closer', closed_at: '2026-10-26T18:45:00Z' };
describe('liberação exclusiva por quem fechou', () => {
  it('permite que quem fechou libere março de 2026', () => {
    expect(canReopenMonth(closure, 'closer')).toBe(true);
  });
  it('não permite outro usuário, inclusive administrador', () => {
    expect(canReopenMonth(closure, 'admin')).toBe(false);
  });
  it('não permite liberação sem autenticação', () => {
    expect(canReopenMonth(closure, null)).toBe(false);
  });
});