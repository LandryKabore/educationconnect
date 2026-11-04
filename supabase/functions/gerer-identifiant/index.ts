import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { LOCKED_BAN_DURATION, lockedPassword } from "../_shared/famille.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function randomPassword(length = 12) {
  // F-22: always 12+ chars with upper, lower, digit and symbol, so temporary
  // passwords also satisfy a stricter Auth password policy.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*?-+";
  const all = upper + lower + digits + symbols;
  const n = Math.max(length, 12);
  const pick = (set: string) => set[crypto.getRandomValues(new Uint8Array(1))[0] % set.length];
  const out = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (out.length < n) out.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint8Array(1))[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: userError,
    } = await caller.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = String(body.action ?? "").trim();
    const targetUserId = String(body.userId ?? body.user_id ?? "").trim();
    const schoolId = String(body.schoolId ?? body.school_id ?? "").trim();

    if (!action || !targetUserId || !schoolId) {
      return new Response(
        JSON.stringify({ error: "action, userId et schoolId requis" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: callerRoles } = await admin
      .from("roles_utilisateurs")
      .select("role, school_id, active")
      .eq("user_id", user.id)
      .eq("active", true);

    const canSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    const canSchoolAdmin = (callerRoles ?? []).some(
      (r) => r.role === "school_admin" && r.school_id === schoolId,
    );
    if (!canSuper && !canSchoolAdmin) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetRole } = await admin
      .from("roles_utilisateurs")
      .select("role, school_id, active")
      .eq("user_id", targetUserId)
      .eq("school_id", schoolId)
      .eq("active", true)
      .maybeSingle();

    if (!targetRole) {
      return new Response(
        JSON.stringify({ error: "Utilisateur introuvable dans cette école" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // F-15: a school admin must not reset the credentials of administrators
    // (peers); that stays with the super admin.
    if (targetRole.role === "school_admin" && !canSuper) {
      return new Response(
        JSON.stringify({
          error: "Seul un super administrateur peut gérer ce compte",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: profil } = await admin
      .from("profils")
      .select("email, family_managed")
      .eq("id", targetUserId)
      .maybeSingle();

    const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // nov3: a family-managed pupil has a locked account. A password reset or a recovery link would
    // quietly open it, so both are refused: the school must first choose "Donner un compte à l'élève".
    if ((action === "reset_password" || action === "recovery_link") && profil?.family_managed) {
      return jsonResponse(
        {
          error:
            "Cet élève n'a pas de compte : le parent est le seul compte. Utilisez « Donner un compte à l'élève » si besoin.",
        },
        400,
      );
    }

    if (action === "give_account" || action === "make_family_managed") {
      if (targetRole.role !== "student") {
        return jsonResponse({ error: "Cette action concerne uniquement les élèves" }, 400);
      }

      if (action === "give_account") {
        // family -> own login: new temporary password, account unlocked
        const tempPassword = randomPassword(10);
        const { error } = await admin.auth.admin.updateUserById(targetUserId, {
          password: tempPassword,
          ban_duration: "none",
          user_metadata: { must_change_password: true },
        });
        if (error) throw error;
        const { error: upError } = await admin
          .from("profils")
          .update({ family_managed: false, must_change_password: true, active: true })
          .eq("id", targetUserId);
        if (upError) throw upError;

        const username =
          (profil?.email?.endsWith("@edufaso.local")
            ? profil.email.replace("@edufaso.local", "")
            : profil?.email) ?? targetUserId.slice(0, 8);
        const { data: existingCred } = await admin
          .from("identifiants_temporaires")
          .select("id")
          .eq("user_id", targetUserId)
          .maybeSingle();
        if (existingCred?.id) {
          await admin
            .from("identifiants_temporaires")
            .update({ temp_password_hint: tempPassword, used: false, username })
            .eq("id", existingCred.id);
        } else {
          await admin.from("identifiants_temporaires").insert({
            user_id: targetUserId,
            username,
            temp_password_hint: tempPassword,
            used: false,
          });
        }
        await admin.from("audit_logs").insert({
          actor_id: user.id,
          action: "give_student_account",
          entity_type: "user",
          entity_id: targetUserId,
          details: { school_id: schoolId, via: "gerer-identifiant" },
        });
        return jsonResponse({
          success: true,
          username,
          tempPassword,
          message: "Compte élève activé : communiquez ces identifiants",
        });
      }

      // make_family_managed: own login -> parent only. Needs a parent, otherwise nobody could see the pupil.
      const { count: parentCount } = await admin
        .from("liens_parent_eleve")
        .select("id", { count: "exact", head: true })
        .eq("student_id", targetUserId);
      if (!parentCount) {
        return jsonResponse(
          { error: "Reliez d'abord un parent à cet élève (menu Parents), sinon personne ne pourra le suivre." },
          400,
        );
      }
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        password: lockedPassword(),
        ban_duration: LOCKED_BAN_DURATION,
        user_metadata: { must_change_password: false },
      });
      if (error) throw error;
      const { error: upError } = await admin
        .from("profils")
        .update({ family_managed: true, must_change_password: false })
        .eq("id", targetUserId);
      if (upError) throw upError;
      await admin.from("identifiants_temporaires").delete().eq("user_id", targetUserId);
      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "make_student_family_managed",
        entity_type: "user",
        entity_id: targetUserId,
        details: { school_id: schoolId, via: "gerer-identifiant" },
      });
      return jsonResponse({
        success: true,
        message: "Compte famille : le login de l'élève est fermé, les parents gardent leur accès",
      });
    }

    if (action === "reset_password") {
      const tempPassword = randomPassword(10);
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword,
        user_metadata: { must_change_password: true },
      });
      if (error) throw error;

      await admin
        .from("profils")
        .update({ must_change_password: true, active: true })
        .eq("id", targetUserId);

      const { data: existingCred } = await admin
        .from("identifiants_temporaires")
        .select("id, username")
        .eq("user_id", targetUserId)
        .maybeSingle();

      const username =
        existingCred?.username ??
        (profil?.email?.endsWith("@edufaso.local")
          ? profil.email.replace("@edufaso.local", "")
          : profil?.email) ??
        targetUserId.slice(0, 8);

      if (existingCred?.id) {
        await admin
          .from("identifiants_temporaires")
          .update({
            temp_password_hint: tempPassword,
            used: false,
            username,
          })
          .eq("id", existingCred.id);
      } else {
        await admin.from("identifiants_temporaires").insert({
          user_id: targetUserId,
          username,
          temp_password_hint: tempPassword,
          used: false,
        });
      }

      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "reset_password",
        entity_type: "user",
        entity_id: targetUserId,
        details: { school_id: schoolId, via: "gerer-identifiant" },
      });

      return new Response(
        JSON.stringify({
          success: true,
          username,
          tempPassword,
          message: "Nouveau mot de passe temporaire généré",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "recovery_link") {
      const email = profil?.email;
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Pas d’email technique pour ce compte" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const redirectTo =
        String(body.redirectTo ?? body.redirect_to ?? "").trim() || undefined;

      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw error;

      const actionLink =
        data.properties?.action_link ??
        (data as { action_link?: string }).action_link ??
        null;

      if (!actionLink) {
        return new Response(
          JSON.stringify({ error: "Impossible de générer le lien" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "recovery_link",
        entity_type: "user",
        entity_id: targetUserId,
        details: { school_id: schoolId, via: "gerer-identifiant" },
      });

      return new Response(
        JSON.stringify({
          success: true,
          recoveryLink: actionLink,
          message: "Lien de réinitialisation généré",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
