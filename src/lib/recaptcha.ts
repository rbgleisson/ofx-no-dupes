/**
 * reCAPTCHA v3 (invisível).
 *
 * COMO CONFIGURAR:
 * 1. Acesse https://www.google.com/recaptcha/admin/create
 * 2. Tipo: "reCAPTCHA v3" (Score based). Domínios: seu domínio + localhost.
 * 3. O Google gera duas chaves:
 *    - Site key   (pública)  -> cole abaixo em RECAPTCHA_SITE_KEY
 *    - Secret key (privada)  -> guarde como segredo do backend: RECAPTCHA_SECRET_KEY
 *
 * Enquanto a site key estiver vazia, o login continua funcionando normalmente
 * (apenas sem a camada do reCAPTCHA; honeypot e rate limiting seguem ativos).
 */
export const RECAPTCHA_SITE_KEY = "";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let loaderPromise: Promise<void> | null = null;

export function isRecaptchaConfigured(): boolean {
  return RECAPTCHA_SITE_KEY.trim().length > 0;
}

function loadScript(): Promise<void> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") return resolve();
    if (window.grecaptcha) return resolve();

    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar reCAPTCHA"));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

export async function loadRecaptcha(): Promise<void> {
  if (!isRecaptchaConfigured()) return;
  try {
    await loadScript();
  } catch {
    // Silencioso: não bloquear o usuário legítimo.
  }
}

export async function getRecaptchaToken(action: string): Promise<string | undefined> {
  if (!isRecaptchaConfigured()) return undefined;
  try {
    await loadScript();
    const grecaptcha = window.grecaptcha;
    if (!grecaptcha) return undefined;
    await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
    return await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
  } catch {
    return undefined;
  }
}
