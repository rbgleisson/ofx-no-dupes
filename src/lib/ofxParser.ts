export interface OFXTransaction {
  id: string; // generated unique key for dedup
  fitId: string;
  type: string;
  date: string;
  amount: number;
  description: string;
  memo?: string;
}

export interface OFXData {
  bankId?: string;
  accountId?: string;
  accountType?: string;
  currency?: string;
  transactions: OFXTransaction[];
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

export function parseOFX(content: string): OFXData {
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
      const amount = parseFloat(amountStr);
      const description = name || memo || 'Sem descrição';

      transactions.push({
        id: generateTransactionId({ fitId, date, amount, description }),
        fitId,
        type,
        date,
        amount,
        description,
        memo: memo && memo !== name ? memo : undefined,
      });
    }
  }

  return { bankId, accountId, accountType, currency, transactions };
}
