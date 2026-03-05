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
    const { fileBase64, fileName, mimeType } = await req.json();

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const isImage = mimeType?.startsWith("image/");
    const isPdf = mimeType === "application/pdf";

    const userContent: any[] = [
      {
        type: "text",
        text: `Analise este documento (${fileName}) e extraia as seguintes informações se disponíveis:
- Data do documento (formato YYYY-MM-DD)
- Valor total (número decimal, negativo se for despesa/pagamento)
- Nome do beneficiário, destinatário ou pagador (a pessoa ou empresa que recebeu ou enviou o pagamento)
- Descrição ou finalidade do pagamento

Responda APENAS em JSON válido, sem markdown, neste formato exato:
{"date": "YYYY-MM-DD" ou null, "amount": número ou null, "name": "nome" ou null, "memo": "descrição/finalidade" ou null}

Se não conseguir identificar algum campo, retorne null para ele.`,
      },
    ];

    if (isImage) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${fileBase64}` },
      });
    } else if (isPdf) {
      userContent.push({
        type: "file",
        file: {
          filename: fileName,
          file_data: `data:application/pdf;base64,${fileBase64}`,
        },
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Use images or PDF." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
            content: userContent,
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

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ date: null, amount: null }), {
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
