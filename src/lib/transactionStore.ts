import { OFXTransaction } from './ofxParser';

const STORAGE_KEY = 'ofx_transactions';

export function getStoredTransactions(): OFXTransaction[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: OFXTransaction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  total: number;
}

export function importTransactions(newTransactions: OFXTransaction[]): ImportResult {
  const existing = getStoredTransactions();
  const existingIds = new Set(existing.map(t => t.id));

  const unique = newTransactions.filter(t => !existingIds.has(t.id));

  if (unique.length > 0) {
    saveTransactions([...existing, ...unique]);
  }

  return {
    imported: unique.length,
    duplicates: newTransactions.length - unique.length,
    total: existing.length + unique.length,
  };
}

export function clearTransactions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
