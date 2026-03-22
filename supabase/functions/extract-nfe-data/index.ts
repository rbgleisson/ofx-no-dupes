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
    const { access_key, categories } = await req.json();

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

    // Parse NF-e key structure
    const uf = access_key.substring(0, 2);
    const aamm = access_key.substring(2, 6);
    const cnpj = access_key.substring(6, 20);
    const modelo = access_key.substring(20, 22);
    const serie = access_key.substring(22, 25);
    const numero = access_key.substring(25, 34);

    const ano = 2000 + parseInt(aamm.substring(0, 2));
    const mes = aamm.substring(2, 4);

    const cnpjFormatado = cnpj.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5"
    );

    const categoriesInfo = categories?.length
      ? `\nCategorias disponíveis no sistema (id | nome):\n${categories.map((c: any) => `${c.id} | ${c.name}`).join("\n")}\n\nEscolha a categoria mais adequada pelo id. Se nenhuma se encaixar, retorne null.`
      : "";

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
            content: `Você é um assistente financeiro brasileiro. Analise esta chave de acesso de NF-e e extraia informações para um lançamento financeiro.

Chave de acesso: ${access_key}
UF: ${uf}
Ano/Mês emissão: ${ano}-${mes}
CNPJ Emitente: ${cnpjFormatado}
Modelo: ${modelo} (55=NF-e, 65=NFC-e)
Série: ${parseInt(serie)}
Número: ${parseInt(numero)}
${categoriesInfo}

Com base no CNPJ ${cnpjFormatado}, identifique:
1. O nome da empresa emitente (se conhecer pelo CNPJ)
2. O ramo de atividade provável
3. Sugira uma descrição curta para o lançamento financeiro
4. Estime o valor como negativo (despesa) já que é uma compra. Se não souber o valor, retorne null.
5. Sugira a categoria mais adequada das disponíveis

Responda APENAS em JSON válido, sem markdown:
{"date": "${ano}-${mes}-01", "amount": null, "name": "nome da empresa", "description": "descrição para o lançamento", "memo": "NF-e nº ${parseInt(numero)} série ${parseInt(serie)} - CNPJ ${cnpjFormatado}", "category_id": "id_da_categoria_ou_null"}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({
        date: `${ano}-${mes}-01`,
        amount: null,
        name: cnpjFormatado,
        description: `Compra - ${cnpjFormatado}`,
        memo: `NF-e nº ${parseInt(numero)} série ${parseInt(serie)}`,
        category_id: null,
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
