import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { access_key } = await req.json();

    if (!access_key || !/^\d{44}$/.test(access_key)) {
      return new Response(JSON.stringify({ error: "Chave de acesso inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Parse NF-e key structure:
    // Positions: UF(2) AAMM(4) CNPJ(14) MOD(2) SERIE(3) NUM(9) FORMA(1) COD(8) DV(1)
    const uf = access_key.substring(0, 2);
    const aamm = access_key.substring(2, 6);
    const cnpj = access_key.substring(6, 20);
    const modelo = access_key.substring(20, 22);
    const serie = access_key.substring(22, 25);
    const numero = access_key.substring(25, 34);

    const ano = 2000 + parseInt(aamm.substring(0, 2));
    const mes = aamm.substring(2, 4);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: `Analise esta chave de acesso de NF-e brasileira e extraia informações:

Chave: ${access_key}
UF: ${uf}
Ano/Mês: ${ano}-${mes}
CNPJ Emitente: ${cnpj}
Modelo: ${modelo} (55=NF-e, 65=NFC-e)
Série: ${serie}
Número: ${numero}

Com base no CNPJ ${cnpj}, identifique o nome da empresa emitente se possível.
Estime a data como o primeiro dia do mês/ano da emissão.

Responda APENAS em JSON válido, sem markdown:
{"date": "${ano}-${mes}-01", "amount": null, "name": "nome da empresa ou CNPJ ${cnpj}", "memo": "NF-e nº ${parseInt(numero)} série ${parseInt(serie)}"}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({
        date: `${ano}-${mes}-01`,
        amount: null,
        name: cnpj,
        memo: `NF-e nº ${parseInt(numero)} série ${parseInt(serie)}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
