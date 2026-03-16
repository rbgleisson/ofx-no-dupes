const STORAGE_VERSION_KEY = 'ofx_browser_storage_version';
const CURRENT_STORAGE_VERSION = '2026-03-16-v1';
const LEGACY_APP_KEYS = ['ofx_transaction_categories', 'ofx_attachments'] as const;

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access issues
  }
}

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage access issues
  }
}

function validateJsonStorageKey(key: string): void {
  const raw = readKey(key);
  if (!raw) return;

  try {
    JSON.parse(raw);
  } catch {
    removeKey(key);
  }
}

function validateAuthStorage(): void {
  const keys = Object.keys(window.localStorage).filter(
    (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
  );

  for (const key of keys) {
    const raw = readKey(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as
        | { access_token?: string; refresh_token?: string; currentSession?: { access_token?: string; refresh_token?: string } }
        | null;

      const hasToken = Boolean(
        parsed?.access_token ||
        parsed?.refresh_token ||
        parsed?.currentSession?.access_token ||
        parsed?.currentSession?.refresh_token
      );

      if (!parsed || typeof parsed !== 'object' || !hasToken) {
        removeKey(key);
      }
    } catch {
      removeKey(key);
    }
  }
}

export function clearAppBrowserStorage(): void {
  if (!canUseLocalStorage()) return;
  LEGACY_APP_KEYS.forEach(removeKey);
}

export function runBrowserStorageMaintenance(): void {
  if (!canUseLocalStorage()) return;

  validateAuthStorage();
  LEGACY_APP_KEYS.forEach(validateJsonStorageKey);

  const appliedVersion = readKey(STORAGE_VERSION_KEY);
  if (appliedVersion !== CURRENT_STORAGE_VERSION) {
    clearAppBrowserStorage();
    writeKey(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
  }
}
