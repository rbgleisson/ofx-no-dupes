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
}

export interface OFXData {
  bankId?: string;
  accountId?: string;
  accountType?: string;
  currency?: string;
  transactions: OFXTransaction[];
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

function parseOFXContent(content: string): OFXData {
  const bankId = extractTag(content, 'BANKID');
  const accountId = extractTag(content, 'ACCTID');
  const accountType = extractTag(content, 'ACCTTYPE');
  const currency = extractTag(content, 'CURDEF');

  const transactions: OFXTransaction[] = [];

  // Split by STMTTRN blocks
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

      transactions.push({
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

  return { bankId, accountId, accountType, currency, transactions };
}

export function parseOFX(content: string, legacyContent?: string): OFXData {
  const parsed = parseOFXContent(content);
  if (!legacyContent || legacyContent === content) return parsed;

  const legacyParsed = parseOFXContent(legacyContent);
  if (legacyParsed.transactions.length !== parsed.transactions.length) return parsed;

  return {
    ...parsed,
    transactions: parsed.transactions.map((transaction, index) => ({
      ...transaction,
      id: legacyParsed.transactions[index].id,
    })),
  };
}
