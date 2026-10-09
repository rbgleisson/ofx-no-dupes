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
  isPossibleDuplicate?: boolean;
}

export interface OFXData {
  bankId?: string;
  accountId?: string;
  accountType?: string;
  currency?: string;
  /** Saldo final do extrato (LEDGERBAL), quando presente. */
  ledgerBalance?: { amount: number; date: string };
  /** Totais calculados das transações */
  totalCredits: number;
  totalDebits: number;
  calculatedNet: number;
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

/**
 * Normaliza e padroniza a descrição/memo removendo espaços duplicados e sufixos bancários genéricos.
 */
function normalizeDescription(description: string): string {
  return description
    .replace(/recebimento\s+pix/i, '')
    .replace(/pix\s+recebido/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function generateTransactionId(tx: { fitId: string; date: string; amount: number; description: string }): string {
  // Remove sufixos sequenciais que bancos geram ao final do FITID para a mesma transação
  const baseFitId = tx.fitId.replace(/00\d+$/, '');
  const normDesc = normalizeDescription(tx.description);
  return `${baseFitId}_${tx.date}_${tx.amount}_${normDesc}`.replace(/\s+/g, '_').toLowerCase();
}

function parseOFXContent(content: string): OFXData {
  const bankId = extractTag(content, 'BANKID');
  const accountId = extractTag(content, 'ACCTID');
  const accountType = extractTag(content, 'ACCTTYPE');
  const currency = extractTag(content, 'CURDEF');

  const rawTransactions: OFXTransaction[] = [];
  const seenIds = new Set<string>();

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
      const txId = generateTransactionId({ fitId, date, amount, description });

      // Sinaliza possíveis duplicidades (mesma data, mesmo valor exato e descrição similar)
      const isDuplicateInBatch = seenIds.has(txId);
      seenIds.add(txId);

      rawTransactions.push({
        id: txId,
        fitId,
        type,
        date,
        amount,
        description,
        memo: memo && memo !== name ? memo : undefined,
        descriptionDigits: extractDigits(`${name || ''} ${memo || ''}`),
        isPossibleDuplicate: isDuplicateInBatch,
      });
    }
  }

  // Filtra/Desduplica mantendo apenas transações únicas ou marcando duplicadas
  const transactions: OFXTransaction[] = [];
  const deduplicatedSet = new Set<string>();

  for (const tx of rawTransactions) {
    if (!deduplicatedSet.has(tx.id)) {
      deduplicatedSet.add(tx.id);
      transactions.push(tx);
    }
  }

  // Totais calculados
  let totalCredits = 0;
  let totalDebits = 0;

  for (const tx of transactions) {
    if (tx.amount > 0) {
      totalCredits += tx.amount;
    } else {
      totalDebits += Math.abs(tx.amount);
    }
  }

  const calculatedNet = totalCredits - totalDebits;

  let ledgerBalance: OFXData['ledgerBalance'];
  const ledgerIdx = content.search(/<LEDGERBAL>/i);
  if (ledgerIdx >= 0) {
    const ledger = content.substring(ledgerIdx, ledgerIdx + 400);
    const balAmt = extractTag(ledger, 'BALAMT');
    const dtAsOf = extractTag(ledger, 'DTASOF');
    const amount = parseFloat(balAmt.replace(',', '.'));
    if (balAmt && dtAsOf && !isNaN(amount)) ledgerBalance = { amount, date: parseOFXDate(dtAsOf) };
  }

  return {
    bankId,
    accountId,
    accountType,
    currency,
    ledgerBalance,
    totalCredits: Math.round(totalCredits * 100) / 100,
    totalDebits: Math.round(totalDebits * 100) / 100,
    calculatedNet: Math.round(calculatedNet * 100) / 100,
    transactions,
  };
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
