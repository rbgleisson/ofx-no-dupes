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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSuperAdmin } = await supabaseAdmin.rpc("is_super_admin", { _user_id: caller.id });
    const { data: isOwnerRole } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "owner" });
    const { data: isAdminRole } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });

    if (!isSuperAdmin && !isOwnerRole && !isAdminRole) {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, email, password, userId, organizationId } = body;

    if (action === "create") {
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email e senha obrigatórios." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const { data: callerOrgId, error: callerOrgErr } = await supabaseAdmin.rpc("get_user_org_id", {
        _user_id: caller.id,
      });
      if (callerOrgErr) {
        return new Response(JSON.stringify({ error: "Não foi possível identificar a organização do chamador." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Usuários comuns, owners e admins só podem criar membros na própria organização.
      const orgId = isSuperAdmin ? (organizationId || callerOrgId) : callerOrgId;
      if (!orgId) {
        return new Response(JSON.stringify({ error: "O chamador não está vinculado a uma organização." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetOrg, error: targetOrgErr } = await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("id", orgId)
        .maybeSingle();
      if (targetOrgErr) {
        return new Response(JSON.stringify({ error: "Não foi possível validar a organização informada." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!targetOrg) {
        return new Response(JSON.stringify({ error: "A organização informada não existe." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingAuthorization, error: authorizationLookupErr } = await supabaseAdmin
        .from("authorized_emails")
        .select("id, organization_id")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();
      if (authorizationLookupErr) {
        return new Response(JSON.stringify({ error: "Não foi possível verificar a autorização deste e-mail." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (existingAuthorization?.organization_id && existingAuthorization.organization_id !== orgId) {
        return new Response(JSON.stringify({ error: "Este e-mail já está autorizado em outra organização." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authorizationResult = existingAuthorization
        ? await supabaseAdmin
            .from("authorized_emails")
            .update({ organization_id: orgId })
            .eq("id", existingAuthorization.id)
        : await supabaseAdmin
            .from("authorized_emails")
            .insert({ email: normalizedEmail, created_by: caller.id, organization_id: orgId });
      if (authorizationResult.error) {
        const status = authorizationResult.error.code === "23505" ? 409 : 500;
        return new Response(JSON.stringify({ error: "Não foi possível autorizar o e-mail na organização." }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });

      if (createErr) {
        if (!existingAuthorization) {
          await supabaseAdmin.from("authorized_emails").delete().eq("email", normalizedEmail).eq("organization_id", orgId);
        }
        return new Response(JSON.stringify({ error: createErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!newUser?.user) {
        return new Response(JSON.stringify({ error: "O usuário não foi criado." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .insert({ user_id: newUser.user.id, organization_id: orgId });
      const { error: permissionsErr } = await supabaseAdmin
        .from("user_permissions")
        .upsert({ user_id: newUser.user.id, organization_id: orgId }, { onConflict: "user_id" });
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUser.user.id, role: "user" });

      if (profileErr || permissionsErr || roleErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        if (!existingAuthorization) {
          await supabaseAdmin.from("authorized_emails").delete().eq("email", normalizedEmail).eq("organization_id", orgId);
        }
        return new Response(JSON.stringify({ error: "O usuário não pôde ser vinculado à organização." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId obrigatório." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (userId === caller.id) {
        return new Response(JSON.stringify({ error: "Você não pode excluir sua própria conta." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetProfile, error: targetProfileErr } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (targetProfileErr) {
        return new Response(JSON.stringify({ error: "Não foi possível consultar a organização do usuário alvo." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!targetProfile) {
        return new Response(JSON.stringify({ error: "Usuário alvo não encontrado ou sem organização vinculada." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isSuperAdmin) {
        const { data: callerOrgId, error: callerOrgErr } = await supabaseAdmin.rpc("get_user_org_id", {
          _user_id: caller.id,
        });
        if (callerOrgErr) {
          return new Response(JSON.stringify({ error: "Não foi possível identificar a organização do chamador." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!callerOrgId || targetProfile.organization_id !== callerOrgId) {
          return new Response(JSON.stringify({ error: "Você não pode excluir usuários de outra organização." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: protectedRoles, error: rolesErr } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .in("role", ["super_admin", "owner"]);
        if (rolesErr) {
          return new Response(JSON.stringify({ error: "Não foi possível verificar o nível de acesso do usuário alvo." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if ((protectedRoles || []).length > 0) {
          return new Response(JSON.stringify({ error: "Apenas um Super Admin pode excluir usuários Owner ou Super Admin." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_organization") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Apenas Super Admin pode criar organizações." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { orgName, ownerEmail, ownerPassword } = body;
      if (!orgName || !ownerEmail || !ownerPassword) {
        return new Response(JSON.stringify({ error: "orgName, ownerEmail e ownerPassword são obrigatórios." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("authorized_emails").upsert(
        { email: ownerEmail.toLowerCase(), created_by: caller.id },
        { onConflict: "email" }
      );

      const { data: newOwner, error: ownerErr } = await supabaseAdmin.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
      });
      if (ownerErr) {
        return new Response(JSON.stringify({ error: ownerErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ownerId = newOwner.user.id;

      const { data: org, error: orgErr } = await supabaseAdmin
        .from("organizations")
        .insert({ name: orgName, owner_id: ownerId })
        .select()
        .single();

      if (orgErr) {
        return new Response(JSON.stringify({ error: orgErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("profiles").insert({ user_id: ownerId, organization_id: org.id });
      await supabaseAdmin.from("user_roles").insert({ user_id: ownerId, role: "owner" });
      await supabaseAdmin.from("user_permissions").insert({ user_id: ownerId, organization_id: org.id });
      await supabaseAdmin.from("authorized_emails")
        .update({ organization_id: org.id })
        .eq("email", ownerEmail.toLowerCase());

      return new Response(JSON.stringify({ success: true, organizationId: org.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_organization") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Apenas Super Admin pode excluir organizações." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orgId = organizationId || body.orgId;
      if (!orgId) {
        return new Response(JSON.stringify({ error: "organizationId obrigatório." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: callerOrgId } = await supabaseAdmin.rpc("get_user_org_id", { _user_id: caller.id });
      if (callerOrgId === orgId) {
        return new Response(JSON.stringify({ error: "Você não pode excluir a sua própria organização." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Usuários vinculados
      const { data: orgProfiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("organization_id", orgId);
      const userIds = (orgProfiles || []).map((p: any) => p.user_id).filter((id: string) => id !== caller.id);

      // Remove dados na ordem de dependência
      const tables = [
        "account_adjustments",
        "installments",
        "attachment_links",
        "transactions",
        "contatos_recorrentes",
        "accounts",
        "categories",
        "chart_accounts",
        "authorized_emails",
        "user_permissions",
        "profiles",
      ];
      for (const t of tables) {
        const { error } = await supabaseAdmin.from(t).delete().eq("organization_id", orgId);
        if (error) {
          return new Response(JSON.stringify({ error: `Falha ao limpar ${t}: ${error.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      for (const uid of userIds) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
        await supabaseAdmin.auth.admin.deleteUser(uid);
      }

      const { error: orgDelErr } = await supabaseAdmin.from("organizations").delete().eq("id", orgId);
      if (orgDelErr) {
        return new Response(JSON.stringify({ error: orgDelErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, deletedUsers: userIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida." }), {

      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
