import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const MIN_SCORE = 0.5;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyRecaptcha(token: string | undefined, ip: string | null) {
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY");
  // Se a chave ainda não foi configurada, não bloqueia o usuário legítimo.
  if (!secret) return { ok: true, skipped: true, score: null as number | null };
  if (!token) return { ok: false, skipped: false, score: null };

  const params = new URLSearchParams({ secret, response: token });
  if (ip) params.set("remoteip", ip);

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    const score = typeof data.score === "number" ? data.score : null;
    return { ok: Boolean(data.success) && (score === null || score >= MIN_SCORE), skipped: false, score };
  } catch (_e) {
    // Falha de rede na verificação não deve travar o login.
    return { ok: true, skipped: true, score: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action: string = body.action ?? "check";
    const email: string = String(body.email ?? "").trim().toLowerCase();
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip");

    if (!email || email.length > 255) return json({ allowed: false, reason: "invalid_email" }, 400);

    if (action === "record") {
      await supabase.from("login_attempts").insert({
        email,
        ip,
        success: Boolean(body.success),
      });
      return json({ recorded: true });
    }

    // Honeypot: campo invisível preenchido = bot.
    if (typeof body.honeypot === "string" && body.honeypot.trim() !== "") {
      await supabase.from("login_attempts").insert({ email, ip, success: false });
      return json({ allowed: false, reason: "bot_detected" });
    }

    const captcha = await verifyRecaptcha(body.recaptchaToken, ip);
    if (!captcha.ok) {
      return json({ allowed: false, reason: "captcha_failed", score: captcha.score });
    }

    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: attempts, error } = await supabase
      .from("login_attempts")
      .select("created_at, success")
      .eq("email", email)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("login-guard select error", error.message);
      return json({ allowed: true, reason: "check_unavailable" });
    }

    const rows = attempts ?? [];
    const lastSuccessIndex = rows.findIndex((r) => r.success);
    const failures = (lastSuccessIndex === -1 ? rows : rows.slice(0, lastSuccessIndex)).filter(
      (r) => !r.success,
    );

    if (failures.length >= MAX_ATTEMPTS) {
      const oldest = failures[failures.length - 1];
      const unlockAt = new Date(new Date(oldest.created_at).getTime() + WINDOW_MINUTES * 60 * 1000);
      const minutesLeft = Math.max(1, Math.ceil((unlockAt.getTime() - Date.now()) / 60000));
      return json({ allowed: false, reason: "rate_limited", minutesLeft });
    }

    return json({ allowed: true, remaining: MAX_ATTEMPTS - failures.length });
  } catch (e) {
    console.error("login-guard error", e);
    return json({ allowed: true, reason: "error" });
  }
});
