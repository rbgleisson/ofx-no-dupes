import { describe, it, expect } from 'vitest';
import { parseOFX, computeStatementCoherence } from '@/lib/ofxParser';

const tx = (fit: string, date: string, amt: string, name: string) =>
  `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${date}<TRNAMT>${amt}<FITID>${fit}<NAME>${name}</STMTTRN>`;
const ofx = (body: string, ledger = '') => `<OFX><BANKID>001<ACCTID>123${body}${ledger}</OFX>`;

describe('parseOFX', () => {
  it('keeps two identical same-day Pix but flags the second with same person', () => {
    const d = parseOFX(ofx(tx('A1', '20260105', '-1200.00', 'PIX JOAO') + tx('B9', '20260105', '-1200.00', 'PIX JOAO')));
    expect(d.transactions).toHaveLength(2);
    expect(d.transactions[1].review).toMatchObject({ reason: 'same_date_amount_type', samePerson: true });
    expect(d.totalDebits).toBe(2400);
  });

  it('flags shared base FITID with incremental suffix', () => {
    const d = parseOFX(ofx(tx('777', '20260105', '10', 'X') + tx('777-1', '20260106', '20', 'Y')));
    expect(d.transactions[1].review?.reason).toBe('same_fitid_base');
  });

  it('drops exact repeated lines and computes totals', () => {
    const line = tx('A', '20260105', '100,50', 'DIZIMO');
    const d = parseOFX(ofx(line + line + tx('B', '20260106', '-30.25', 'LUZ')));
    expect(d.exactDuplicatesRemoved).toBe(1);
    expect(d.totalCredits).toBe(100.5);
    expect(d.totalDebits).toBe(30.25);
    expect(d.calculatedNet).toBe(70.25);
  });

  it('checks LEDGERBAL coherence', () => {
    const d = parseOFX(ofx(tx('A', '20260105', '100', 'X'), '<LEDGERBAL><BALAMT>600<DTASOF>20260131</LEDGERBAL>'));
    const c = computeStatementCoherence(d, 500)!;
    expect(c.impliedOpeningBalance).toBe(500);
    expect(c.isCoherent).toBe(true);
    expect(computeStatementCoherence(d, 490)!.difference).toBe(10);
  });
});
