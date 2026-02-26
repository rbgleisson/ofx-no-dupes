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
    // Auth check
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!transaction_id) {
      return new Response(
        JSON.stringify({ error: "transaction_id é obrigatório" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch DANFE PDF from consultadanfe.com.br (free, no key needed)
    const danfeUrl = `https://consultadanfe.com.br/api/danfe/${access_key}`;
    const pdfResponse = await fetch(danfeUrl);

    if (!pdfResponse.ok) {
      // Fallback: try alternative free endpoint
      const altUrl = `https://www.meudanfe.com.br/api/v1/get/nfe/${access_key}/pdf`;
      const altResponse = await fetch(altUrl);

      if (!altResponse.ok) {
        return new Response(
          JSON.stringify({
            error: "Não foi possível baixar o DANFE. A nota pode não estar disponível.",
            access_key,
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const pdfBytes = await altResponse.arrayBuffer();
      return await uploadAndLink(supabase, transaction_id, access_key, pdfBytes, corsHeaders);
    }

    const pdfBytes = await pdfResponse.arrayBuffer();
    return await uploadAndLink(supabase, transaction_id, access_key, pdfBytes, corsHeaders);
  } catch (err) {
    console.error("fetch-danfe error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao buscar DANFE" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function uploadAndLink(
  supabase: any,
  transactionId: string,
  accessKey: string,
  pdfBytes: ArrayBuffer,
  headers: Record<string, string>
) {
  const path = `${transactionId}/danfe_${accessKey.slice(-8)}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("transaction-docs")
    .upload(path, new Uint8Array(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return new Response(
      JSON.stringify({ error: "Falha no upload do PDF: " + uploadError.message }),
      {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  }

  const { data: urlData } = supabase.storage
    .from("transaction-docs")
    .getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ attachment_url: urlData.publicUrl })
    .eq("id", transactionId);

  if (updateError) {
    return new Response(
      JSON.stringify({ error: "PDF salvo mas falha ao vincular: " + updateError.message }),
      {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      attachment_url: urlData.publicUrl,
      access_key: accessKey,
    }),
    {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    }
  );
}
