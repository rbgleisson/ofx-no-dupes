export interface OFXTransaction {
  id: string; // generated unique key for dedup
  fitId: string;
  type: string;
  date: string;
  amount: number;
  description: string;
  memo?: string;
  /** Only digits found in description+memo (used for CPF/CNPJ matching). */
  descriptionDigits: string;
  /**
   * Marcação de revisão quando outro lançamento do arquivo parece repetido.
   * O lançamento NÃO é descartado: dois pagamentos idênticos podem ser reais.
   */
  review?: {
    reason: 'same_fitid_base' | 'same_date_amount_type';
    /** true quando também coincide a pessoa/descrição (ex.: dois Pix iguais). */
    samePerson: boolean;
    duplicateOfId: string;
  };
}

export interface StatementCoherence {
  ledgerBalance: number;
  /** Saldo inicial implícito = LEDGERBAL − líquido do arquivo. */
  impliedOpeningBalance: number;
  /** Diferença entre LEDGERBAL e (saldo anterior informado + líquido), quando há saldo anterior. */
  difference?: number;
  isCoherent?: boolean;
}

export interface OFXData {
  bankId?: string;
  accountId?: string;
  accountType?: string;
  currency?: string;
  /** Saldo final do extrato (LEDGERBAL), quando presente. */
  ledgerBalance?: { amount: number; date: string };
  transactions: OFXTransaction[];
  /** Soma de todas as entradas (valores positivos). */
  totalCredits: number;
  /** Soma de todas as saídas, em valor absoluto. */
  totalDebits: number;
  /** totalCredits − totalDebits. */
  calculatedNet: number;
  /** Quantidade de lançamentos idênticos (mesmo FITID completo) removidos. */
  exactDuplicatesRemoved: number;
  /** Lançamentos marcados para revisão (não removidos). */
  reviewCount: number;
}

/** Extracts a contiguous run of digits from a raw OFX text (description/memo). */
export function extractDigits(text: string): string {
  return (text || '').replace(/\D/g, '');
}

export interface ContactMatchInput {
  documento_digits: string;
  nome: string;
  categoria_id: string | null;
}

/**
 * Given an OFX transaction and a list of registered contacts, returns the
 * matching contact when: (a) amount is negative (debit) AND (b) the digits
 * masked by the bank in the description/memo are contained in a contact's
 * full CPF/CNPJ digits. Returns null otherwise.
 */
export function matchContactForOfxTx<T extends ContactMatchInput>(
  tx: { amount: number; descriptionDigits: string },
  contacts: T[],
  minDigits = 3,
): T | null {
  if (tx.amount >= 0) return null;
  const digits = tx.descriptionDigits;
  if (!digits || digits.length < minDigits) return null;
  for (const c of contacts) {
    const full = c.documento_digits || '';
    if (full.length >= minDigits && full.includes(digits)) return c;
  }
  return null;
}

function parseOFXDate(dateStr: string): string {
  // OFX dates: YYYYMMDDHHMMSS or YYYYMMDD
  const clean = dateStr.replace(/\[.*\]/, '').trim();
  const year = clean.substring(0, 4);
  const month = clean.substring(4, 6);
  const day = clean.substring(6, 8);
  return `${year}-${month}-${day}`;
}

function extractTag(content: string, tag: string): string {
  // OFX can be SGML (no closing tags) or XML
  const xmlRegex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const xmlMatch = content.match(xmlRegex);
  if (xmlMatch) return xmlMatch[1].trim();

  const sgmlRegex = new RegExp(`<${tag}>([^\\r\\n<]+)`, 'i');
  const sgmlMatch = content.match(sgmlRegex);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return '';
}

function generateTransactionId(tx: { fitId: string; date: string; amount: number; description: string }): string {
  return `${tx.fitId}_${tx.date}_${tx.amount}_${tx.description}`.replace(/\s+/g, '_').toLowerCase();
}

/** FITID sem sufixo incremental do banco (ex.: "123-1", "123_02", "123.3" → "123"). */
export function baseFitId(fitId: string): string {
  return (fitId || '').trim().replace(/[-_.]\d{1,3}$/, '');
}

function normalizePerson(s: string): string {
  return (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Remove apenas cópias idênticas (mesmo id gerado) e marca para revisão os
 * lançamentos que compartilham o FITID base ou mesma data+valor+tipo.
 * Pagamentos semelhantes não são descartados para não distorcer o saldo.
 */
export function dedupeOfxTransactions(list: OFXTransaction[]): { transactions: OFXTransaction[]; exactRemoved: number } {
  const seenIds = new Set<string>();
  const byBase = new Map<string, OFXTransaction>();
  const byKey = new Map<string, OFXTransaction[]>();
  const result: OFXTransaction[] = [];
  let exactRemoved = 0;

  for (const tx of list) {
    if (seenIds.has(tx.id)) { exactRemoved++; continue; }
    seenIds.add(tx.id);

    const item: OFXTransaction = { ...tx };
    const base = baseFitId(tx.fitId);
    const direction = tx.amount >= 0 ? 'C' : 'D';
    const key = `${tx.date}|${round2(tx.amount).toFixed(2)}|${direction}`;
    const person = normalizePerson(`${tx.description} ${tx.memo || ''}`);

    const baseMatch = base ? byBase.get(base) : undefined;
    const keyMatches = byKey.get(key) || [];
    const samePersonMatch = keyMatches.find(o => normalizePerson(`${o.description} ${o.memo || ''}`) === person);

    if (samePersonMatch || keyMatches.length > 0) {
      const other = samePersonMatch || keyMatches[0];
      item.review = { reason: 'same_date_amount_type', samePerson: !!samePersonMatch, duplicateOfId: other.id };
    } else if (baseMatch && baseMatch.fitId !== tx.fitId) {
      item.review = { reason: 'same_fitid_base', samePerson: false, duplicateOfId: baseMatch.id };
    }

    if (base && !byBase.has(base)) byBase.set(base, item);
    byKey.set(key, [...keyMatches, item]);
    result.push(item);
  }
  return { transactions: result, exactRemoved };
}

export function computeOfxTotals(transactions: OFXTransaction[]) {
  let credits = 0;
  let debits = 0;
  for (const t of transactions) {
    if (t.amount >= 0) credits += t.amount; else debits += -t.amount;
  }
  return { totalCredits: round2(credits), totalDebits: round2(debits), calculatedNet: round2(credits - debits) };
}

/** Coerência do extrato: LEDGERBAL deve ser saldo anterior + líquido do arquivo. */
export function computeStatementCoherence(data: Pick<OFXData, 'ledgerBalance' | 'calculatedNet'>, previousBalance?: number): StatementCoherence | null {
  if (!data.ledgerBalance) return null;
  const ledger = data.ledgerBalance.amount;
  const out: StatementCoherence = { ledgerBalance: ledger, impliedOpeningBalance: round2(ledger - data.calculatedNet) };
  if (previousBalance !== undefined && previousBalance !== null) {
    out.difference = round2(ledger - (previousBalance + data.calculatedNet));
    out.isCoherent = Math.abs(out.difference) < 0.01;
  }
  return out;
}

function parseOFXContent(content: string): OFXData {
  const bankId = extractTag(content, 'BANKID');
  const accountId = extractTag(content, 'ACCTID');
  const accountType = extractTag(content, 'ACCTTYPE');
  const currency = extractTag(content, 'CURDEF');

  const raw: OFXTransaction[] = [];
  const txBlocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of txBlocks) {
    const endIdx = block.search(/<\/STMTTRN>/i);
    const txContent = endIdx >= 0 ? block.substring(0, endIdx) : block;

    const type = extractTag(txContent, 'TRNTYPE');
    const datePosted = extractTag(txContent, 'DTPOSTED');
    const amountStr = extractTag(txContent, 'TRNAMT');
    const fitId = extractTag(txContent, 'FITID');
    const name = extractTag(txContent, 'NAME');
    const memo = extractTag(txContent, 'MEMO');

    if (datePosted && amountStr) {
      const date = parseOFXDate(datePosted);
      const amount = parseFloat(amountStr.replace(',', '.'));
      const description = name || memo || 'Sem descrição';

      raw.push({
        id: generateTransactionId({ fitId, date, amount, description }),
        fitId,
        type,
        date,
        amount,
        description,
        memo: memo && memo !== name ? memo : undefined,
        descriptionDigits: extractDigits(`${name || ''} ${memo || ''}`),
      });
    }
  }

  let ledgerBalance: OFXData['ledgerBalance'];
  const ledgerIdx = content.search(/<LEDGERBAL>/i);
  if (ledgerIdx >= 0) {
    const ledger = content.substring(ledgerIdx, ledgerIdx + 400);
    const balAmt = extractTag(ledger, 'BALAMT');
    const dtAsOf = extractTag(ledger, 'DTASOF');
    const amount = parseFloat(balAmt.replace(',', '.'));
    if (balAmt && dtAsOf && !isNaN(amount)) ledgerBalance = { amount, date: parseOFXDate(dtAsOf) };
  }

  const { transactions, exactRemoved } = dedupeOfxTransactions(raw);
  return {
    bankId, accountId, accountType, currency, ledgerBalance, transactions,
    ...computeOfxTotals(transactions),
    exactDuplicatesRemoved: exactRemoved,
    reviewCount: transactions.filter(t => t.review).length,
  };
}

export function parseOFX(content: string, legacyContent?: string): OFXData {
  const parsed = parseOFXContent(content);
  if (!legacyContent || legacyContent === content) return parsed;

  const legacyParsed = parseOFXContent(legacyContent);
  if (legacyParsed.transactions.length !== parsed.transactions.length) return parsed;

  const idMap = new Map(parsed.transactions.map((t, i) => [t.id, legacyParsed.transactions[i].id]));
  return {
    ...parsed,
    transactions: parsed.transactions.map((transaction, index) => ({
      ...transaction,
      id: legacyParsed.transactions[index].id,
      review: transaction.review
        ? { ...transaction.review, duplicateOfId: idMap.get(transaction.review.duplicateOfId) ?? transaction.review.duplicateOfId }
        : undefined,
    })),
  };
}
