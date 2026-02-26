import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { access_key, transaction_id } = await req.json();

    if (!access_key || !/^\d{44}$/.test(access_key)) {
      return new Response(
        JSON.stringify({ error: "Chave de acesso inválida (44 dígitos)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: "transaction_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For now, store the access key in the transaction memo
    // In production, integrate with a paid DANFE API to download the PDF
    const { data: tx } = await supabase
      .from("transactions")
      .select("memo")
      .eq("id", transaction_id)
      .single();

    const currentMemo = tx?.memo || "";
    const newMemo = currentMemo
      ? `${currentMemo} | NF-e: ${access_key}`
      : `NF-e: ${access_key}`;

    const { error: updateError } = await supabase
      .from("transactions")
      .update({ memo: newMemo })
      .eq("id", transaction_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Falha ao salvar chave: " + updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        access_key,
        message: "Chave de acesso salva na transação. Integração com API de DANFE pendente.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-danfe error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
