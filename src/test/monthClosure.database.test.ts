import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

// These checks run in one rolled-back transaction, against the actual guards.
const databaseUrl = process.env.SUPABASE_DB_URL;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
describe.skipIf(!databaseUrl || !sessionJson)('proteção mensal no banco', () => {
  const sql = postgres(databaseUrl || '', { max: 1 });
  const userId: string = JSON.parse(sessionJson || '{}').user?.id;
  let orgId = '';
  let transactionId = '';
  beforeAll(async () => {
    await sql`BEGIN`;
    await sql`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    const [profile] = await sql`SELECT organization_id FROM public.profiles WHERE user_id=${userId}`;
    orgId = profile.organization_id;
    const [tx] = await sql`INSERT INTO public.transactions(organization_id,user_id,date,amount,description) VALUES (${orgId},${userId},'2098-02-10',1,'Teste transacional de fechamento') RETURNING id`;
    transactionId = tx.id;
    await sql`INSERT INTO public.month_closures(organization_id,year,month,closed_by) VALUES (${orgId},2098,2,${userId})`;
  });
  afterAll(async () => { await sql`ROLLBACK`; await sql.end(); });
  async function rejected(query: () => Promise<unknown>) {
    await sql`SAVEPOINT expected_rejection`;
    let message = '';
    try { await query(); } catch (error) { message = (error as Error).message; }
    await sql`ROLLBACK TO SAVEPOINT expected_rejection`;
    return message;
  }
  it('bloqueia importação/inclusão em fevereiro de 2098', async () => {
    expect(await rejected(() => sql`INSERT INTO public.transactions(organization_id,date,amount,description) VALUES (${orgId},'2098-02-11',2,'Teste')`)).toContain('Mês fechado');
  });
  it('bloqueia mudança de saldo anterior que afetaria mês fechado', async () => {
    expect(await rejected(() => sql`INSERT INTO public.monthly_opening_balances(organization_id,year,month,amount) VALUES (${orgId},2098,1,100)`)).toContain('Mês fechado');
  });
  it('mantém consultas disponíveis', async () => {
    const [row] = await sql`SELECT amount FROM public.transactions WHERE id=${transactionId}`;
    expect(Number(row.amount)).toBe(1);
  });
  it('permite inclusão em mês aberto', async () => {
    const [row] = await sql`INSERT INTO public.transactions(organization_id,date,amount,description) VALUES (${orgId},'2098-03-01',2,'Teste em mês aberto') RETURNING amount`;
    expect(Number(row.amount)).toBe(2);
  });
});