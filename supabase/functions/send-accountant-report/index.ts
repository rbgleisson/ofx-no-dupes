import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as sdkCorsHeaders } from "npm:@supabase/supabase-js@2/cors";
import ExcelJS from "npm:exceljs@4.4.0";

const corsHeaders = {
  ...sdkCorsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ALL_COLUMNS: Record<string, string> = {
  date: "Data",
  description: "Descrição",
  memo: "Memo",
  amount: "Valor",
  category_code: "Código Categoria",
  category: "Categoria",
  account: "Conta",
  chart_account: "Conta Contábil",
  chart_account_code: "Código Contábil",
};

const DEFAULT_COLUMNS = [
  "date", "description", "amount", "category_code", "category", "account", "chart_account_code",
];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const thinBorder = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
};

const formatDate = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
};

const splitCategory = (cat?: { name?: string; code?: string | null }) => {
  if (!cat) return { code: "", name: "" };
  const raw = cat.name || "";
  const match = raw.match(/^\s*([\w.]+)\s+-\s+(.+)$/);
  return { code: (cat.code || match?.[1] || "").trim(), name: (match?.[2] || raw).trim() };
};

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const month = Number(body?.month);
    const year = Number(body?.year);
    const format = body?.format === "alterdata" ? "alterdata" : body?.format === "generic" || body?.format == null ? "generic" : null;
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return json({ error: "Mês/ano inválidos." }, 400);
    }
    if (!format) return json({ error: "Formato de exportação inválido." }, 400);

    // Organização do usuário autenticado (nunca vinda do cliente)
    const { data: orgId } = await admin.rpc("get_user_org_id", { _user_id: caller.id });
    if (!orgId) return json({ error: "Usuário sem empresa vinculada." }, 403);

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, accountant_email, accountant_columns, accountant_debit_code")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return json({ error: "Empresa não encontrada." }, 404);

    const to = (org.accountant_email || "").trim();
    if (!to) return json({ error: "Configure o e-mail do contador nas configurações da empresa." }, 400);
    if (!resendKey) return json({ error: "RESEND_API_KEY não configurada no backend." }, 500);

    const cols: string[] = Array.isArray(org.accountant_columns) && org.accountant_columns.length
      ? (org.accountant_columns as string[]).filter((k) => ALL_COLUMNS[k])
      : DEFAULT_COLUMNS;

    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(Date.UTC(year, month, 1));
    const end = endDate.toISOString().slice(0, 10);

    const [{ data: txs }, { data: categories }, { data: accounts }, { data: chartAccounts }] = await Promise.all([
      admin.from("transactions").select("*").eq("organization_id", orgId).gte("date", start).lt("date", end).order("date"),
      admin.from("categories").select("id, name, code").eq("organization_id", orgId),
      admin.from("accounts").select("id, name").eq("organization_id", orgId),
      admin.from("chart_accounts").select("id, code, name"),
    ]);

    const rows = (txs || []).filter((t: any) => !t.is_transfer);
    if (rows.length === 0) return json({ error: "Nenhum lançamento real no período selecionado." }, 400);

    const catById = new Map((categories || []).map((c: any) => [c.id, c]));
    const accById = new Map((accounts || []).map((a: any) => [a.id, a]));
    const chartById = new Map((chartAccounts || []).map((c: any) => [c.id, c]));

    if (format === "alterdata") {
      const missing = rows.filter((tx: any) => {
        const chartAccount: any = chartById.get(tx.chart_account_id);
        return !tx.chart_account_id || !String(chartAccount?.code || "").trim();
      });
      if (missing.length > 0) {
        return json({
          error: `${missing.length} lançamento${missing.length === 1 ? " precisa" : "s precisam"} de conta contábil antes do envio no formato Alterdata. Revise o período e tente novamente.`,
          code: "MISSING_CHART_ACCOUNTS",
          missingCount: missing.length,
        }, 422);
      }
    }

    const wb = new ExcelJS.Workbook();

    const buildSheet = (name: string, list: any[]) => {
      const ws = wb.addWorksheet(name);
      ws.columns = cols.map((key) => {
        if (key === "description") return { width: 42 };
        if (key === "memo" || key === "chart_account") return { width: 32 };
        if (key === "category" || key === "account") return { width: 22 };
        if (key === "amount") return { width: 16 };
        return { width: 14 };
      });

      const header = ws.addRow(cols.map((k) => ALL_COLUMNS[k]));
      header.font = { bold: true, size: 10 };
      header.alignment = { horizontal: "center" };
      header.eachCell((cell: any) => {
        cell.border = thinBorder;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      });

      let total = 0;
      for (const tx of list) {
        const cat: any = catById.get(tx.category_id);
        const acc: any = accById.get(tx.account_id);
        const ca: any = chartById.get(tx.chart_account_id);
        const values = cols.map((key) => {
          switch (key) {
            case "date": return formatDate(tx.date);
            case "description": return tx.description || "";
            case "memo": return tx.memo || "";
            case "amount": { const a = Number(tx.amount); total += a; return a; }
            case "category": return splitCategory(cat).name;
            case "category_code": return splitCategory(cat).code;
            case "account": return acc?.name || "";
            case "chart_account": return ca ? `${ca.code} - ${ca.name}` : "";
            case "chart_account_code": return ca?.code || "";
            default: return "";
          }
        });
        const r = ws.addRow(values);
        r.font = { size: 10 };
        r.eachCell((cell: any, i: number) => {
          cell.border = thinBorder;
          if (cols[i - 1] === "amount") {
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right" };
          }
        });
      }

      if (list.length && cols.includes("amount")) {
        const totalRow = ws.addRow(cols.map((k, i) => (i === 0 ? `TOTAL (${list.length})` : k === "amount" ? total : "")));
        totalRow.font = { bold: true, size: 11 };
        totalRow.eachCell((cell: any, i: number) => {
          cell.border = thinBorder;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
          if (cols[i - 1] === "amount") {
            cell.numFmt = "#,##0.00";
            cell.alignment = { horizontal: "right" };
          }
        });
      }
    };

    if (format === "alterdata") {
      const ws = wb.addWorksheet("Lançamentos");
      ws.columns = [
        { header: "lancto auto", key: "auto", width: 16 },
        { header: "debito", key: "debit", width: 14 },
        { header: "credito", key: "credit", width: 16 },
        { header: "data", key: "date", width: 14 },
        { header: "valor", key: "amount", width: 16 },
        { header: "cód histórico", key: "historyCode", width: 16 },
        { header: "complemento historico", key: "history", width: 42 },
      ];
      const header = ws.getRow(1);
      header.font = { bold: true, size: 10, name: "Arial" };
      header.alignment = { horizontal: "center" };
      header.eachCell((cell: any) => {
        cell.border = thinBorder;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      });

      for (const tx of rows) {
        const chartAccount: any = chartById.get(tx.chart_account_id);
        const chartCode = String(chartAccount?.code || "").trim();
        const row = ws.addRow({
          auto: chartCode,
          debit: String(org.accountant_debit_code || "35").trim() || "35",
          credit: chartCode,
          date: formatDate(tx.date),
          amount: Number(tx.amount),
          historyCode: "",
          history: tx.description || "",
        });
        row.font = { size: 10, name: "Arial" };
        row.eachCell({ includeEmpty: true }, (cell: any) => { cell.border = thinBorder; });
        row.getCell(5).numFmt = "#,##0.00;[Red]-#,##0.00;0.00";
      }
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = { from: "A1", to: "G1" };
    } else {
      buildSheet("Entradas", rows.filter((t: any) => Number(t.amount) >= 0));
      buildSheet("Saídas", rows.filter((t: any) => Number(t.amount) < 0));
    }

    const buffer = await wb.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);

    const monthLabel = MONTHS[month - 1];
    const fileName = `Relatorio_${slug(org.name)}_${monthLabel}_${year}.xlsx`;
    const subject = `Relatório financeiro — ${org.name} — ${monthLabel}/${year}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: Deno.env.get("ACCOUNTANT_FROM_EMAIL") || "Relatórios <onboarding@resend.dev>",
        to: [to],
        subject,
        html: `<p>Olá,</p><p>Segue em anexo o relatório financeiro de <strong>${org.name}</strong> referente a <strong>${monthLabel}/${year}</strong> (${rows.length} lançamentos).</p><p>Enviado automaticamente pelo sistema financeiro.</p>`,
        attachments: [{ filename: fileName, content: base64 }],
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`Resend error [${res.status}]: ${details}`);
      return json({ error: "Falha ao enviar o e-mail.", status: res.status, details }, res.status);
    }

    return json({ success: true, to, fileName, subject, count: rows.length, format });
  } catch (err) {
    console.error("send-accountant-report error:", err);
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
