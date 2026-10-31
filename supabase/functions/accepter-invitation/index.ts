import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SPECIAL_RE = /[^A-Za-z0-9]/;

/** Same rules as src/lib/passwordRules.ts (8+, uppercase, digit, special). */
function isStrongPassword(p: string) {
  return (
    p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p) && SPECIAL_RE.test(p)
  );
}

const INVITABLE_ROLES = ["school_admin", "teacher", "parent", "super_admin"];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    if (!token) {
      return json(400, { error: "token requis" });
    }
    if (!isStrongPassword(password)) {
      return json(400, {
        error:
          "Mot de passe trop faible : 8 caractères minimum, avec une majuscule, un chiffre et un caractère spécial.",
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invitation, error } = await admin
      .from("invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error || !invitation) {
      return new Response(JSON.stringify({ error: "Invitation introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invitation.accepted_at) {
      return new Response(JSON.stringify({ error: "Invitation déjà utilisée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if ((invitation as { cancelled_at?: string | null }).cancelled_at) {
      return new Response(JSON.stringify({ error: "Invitation annulée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invitation expirée" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = (invitation.email as string).trim().toLowerCase();
    const firstName = invitation.first_name as string;
    const lastName = invitation.last_name as string;
    const role = invitation.role as string;
    const schoolId = invitation.school_id as string | null;

    if (!INVITABLE_ROLES.includes(role) || (role !== "super_admin" && !schoolId)) {
      return json(400, { error: "Invitation invalide" });
    }

    // Defence in depth (F-03 / B-02): the invitation must have been issued by
    // someone who is (still) allowed to grant that role.  Platform roles need a
    // super admin inviter; school roles need a super admin or an admin of that
    // school.  This does not rely on the invitations table RLS alone.
    const { data: inviterRoles } = invitation.invited_by
      ? await admin
          .from("roles_utilisateurs")
          .select("role, school_id")
          .eq("user_id", invitation.invited_by)
          .eq("active", true)
      : { data: [] as { role: string; school_id: string | null }[] };
    const inviterIsSuper = (inviterRoles ?? []).some(
      (r) => r.role === "super_admin",
    );
    const inviterAdminsSchool = (inviterRoles ?? []).some(
      (r) => r.role === "school_admin" && r.school_id === schoolId,
    );
    if (role === "super_admin" ? !inviterIsSuper : !(inviterIsSuper || inviterAdminsSchool)) {
      return json(403, { error: "Invitation non valide" });
    }

    // Find an existing auth user (paginated: listUsers is capped per page).
    let existing: {
      id: string;
      email_confirmed_at?: string | null;
      last_sign_in_at?: string | null;
    } | null = null;
    for (let page = 1; page <= 50 && !existing; page++) {
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (listErr) throw listErr;
      existing =
        listed?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;
      if ((listed?.users?.length ?? 0) < 1000) break;
    }

    // A "pending invite" account (created by inviteUserByEmail, never confirmed
    // and never signed in) may have its password set from this link.  An
    // account that already exists for real must NEVER have its credentials or
    // profile changed from an invitation token (B-07): it only gets the new
    // role and keeps its current password.
    const pendingInvite =
      !!existing && !existing.email_confirmed_at && !existing.last_sign_in_at;
    const existingRealAccount = !!existing && !pendingInvite;
    let userId = existing?.id as string | undefined;

    if (existingRealAccount) {
      const { data: existingProfile } = await admin
        .from("profils")
        .select("active")
        .eq("id", userId!)
        .maybeSingle();
      if (existingProfile && existingProfile.active === false) {
        return json(403, {
          error: "Ce compte est verrouillé. Contactez le support EduFaso.",
        });
      }
    } else if (userId) {
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          must_change_password: false,
        },
        app_metadata: { role, school_id: schoolId },
      });
      if (updErr) throw updErr;
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            must_change_password: false,
          },
          app_metadata: { role, school_id: schoolId },
        });
      if (createErr || !created.user) throw createErr ?? new Error("Création échouée");
      userId = created.user.id;
    }

    if (existingRealAccount) {
      // Only create a profile if the account somehow has none.
      await admin.from("profils").upsert(
        {
          id: userId,
          first_name: firstName,
          last_name: lastName,
          email,
          must_change_password: false,
          active: true,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    } else {
      await admin.from("profils").upsert({
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        must_change_password: false,
        active: true,
      });
    }

    // Upsert role (unique on user_id+role+school_id — don't insert a duplicate)
    let existingRoleQuery = admin
      .from("roles_utilisateurs")
      .select("id")
      .eq("user_id", userId)
      .eq("role", role);
    existingRoleQuery = schoolId
      ? existingRoleQuery.eq("school_id", schoolId)
      : existingRoleQuery.is("school_id", null);
    const { data: existingRole } = await existingRoleQuery.maybeSingle();

    if (existingRole?.id) {
      const { error: roleUpdErr } = await admin
        .from("roles_utilisateurs")
        .update({ active: true })
        .eq("id", existingRole.id);
      if (roleUpdErr) throw roleUpdErr;
    } else {
      const { error: roleInsErr } = await admin.from("roles_utilisateurs").insert({
        user_id: userId,
        role,
        school_id: schoolId || null,
        active: true,
      });
      if (roleInsErr) throw roleInsErr;
    }

    await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return new Response(
      JSON.stringify({
        success: true,
        email,
        existingAccount: existingRealAccount,
        message: existingRealAccount
          ? "Un compte existe déjà avec cet email : le nouveau rôle a été ajouté. Connectez-vous avec votre mot de passe actuel."
          : "Compte créé. Vous pouvez ouvrir l'application EduFaso et vous connecter.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur serveur",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
