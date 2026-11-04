import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  dobIsPlausible,
  LOCKED_BAN_DURATION,
  lockedPassword,
  normalizeDob,
  normalizeGender,
} from "../_shared/famille.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Role = "super_admin" | "school_admin" | "teacher" | "student" | "parent";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 20);
}

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
    const role = body.role as Role;
    const schoolId = (body.schoolId ?? body.school_id ?? null) as string | null;
    const firstName = String(body.firstName ?? body.first_name ?? "").trim();
    const lastName = String(body.lastName ?? body.last_name ?? "").trim();
    const classId = (body.classId ?? body.class_id ?? null) as string | null;
    const academicYearId = (body.academicYearId ?? body.academic_year_id ?? null) as
      | string
      | null;
    const subjectId = (body.subjectId ?? body.subject_id ?? null) as string | null;
    const studentId = (body.studentId ?? body.student_id ?? null) as string | null;
    const phone = body.phone != null ? String(body.phone).trim() || null : null;
    const dateOfBirth = body.dateOfBirth ?? body.date_of_birth ?? null;
    const gender = body.gender != null ? String(body.gender).trim() || null : null;
    const address = body.address != null ? String(body.address).trim() || null : null;
    const matricule =
      body.matricule != null ? String(body.matricule).trim() || null : null;
    const relationship =
      body.relationship != null
        ? String(body.relationship).trim() || "parent"
        : "parent";
    const rawContact = body.contactEmail ?? body.contact_email;
    const contactEmail =
      rawContact != null
        ? String(rawContact).trim().toLowerCase() || null
        : null;

    if (!role || !firstName || !lastName) {
      return new Response(
        JSON.stringify({ error: "role, firstName et lastName requis" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: isSuper } = await admin.rpc("ef_is_super_admin");
    // Check caller permissions via service using caller's id
    const { data: callerRoles } = await admin
      .from("roles_utilisateurs")
      .select("role, school_id, active")
      .eq("user_id", user.id)
      .eq("active", true);

    const canSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
    const canSchoolAdmin = (callerRoles ?? []).some(
      (r) =>
        r.role === "school_admin" &&
        (!schoolId || r.school_id === schoolId),
    );

    if (role === "super_admin" && !canSuper) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role !== "super_admin" && !canSuper && !canSchoolAdmin) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role !== "super_admin" && !schoolId) {
      return new Response(JSON.stringify({ error: "schoolId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // F-15: only a super admin may create school administrators.
    if (role === "school_admin" && !canSuper) {
      return new Response(
        JSON.stringify({
          error: "Seul un super administrateur peut créer un administrateur d'école",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // F-05: every referenced id must belong to schoolId.  This function writes
    // with the service role, so RLS does not protect these foreign keys.
    if (role !== "super_admin" && schoolId) {
      const badRef = (msg: string) =>
        new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      if (classId) {
        const { data: cls } = await admin
          .from("classes")
          .select("school_id")
          .eq("id", classId)
          .maybeSingle();
        if (!cls || cls.school_id !== schoolId) {
          return badRef("Classe introuvable dans cette école");
        }
      }
      if (academicYearId) {
        const { data: yr } = await admin
          .from("annees_scolaires")
          .select("school_id")
          .eq("id", academicYearId)
          .maybeSingle();
        if (!yr || yr.school_id !== schoolId) {
          return badRef("Année scolaire introuvable dans cette école");
        }
      }
      if (subjectId) {
        const { data: sub } = await admin
          .from("matieres")
          .select("school_id")
          .eq("id", subjectId)
          .maybeSingle();
        if (!sub || sub.school_id !== schoolId) {
          return badRef("Matière introuvable dans cette école");
        }
      }
      if (studentId) {
        const { data: stu } = await admin
          .from("roles_utilisateurs")
          .select("id")
          .eq("user_id", studentId)
          .eq("role", "student")
          .eq("school_id", schoolId)
          .maybeSingle();
        if (!stu) {
          return badRef("Élève introuvable dans cette école");
        }
      }
    }

    // nov3: identity of a pupil is validated here too (the browser form is not trusted)
    let storedGender = gender;
    let storedDob: string | null = dateOfBirth ? String(dateOfBirth) : null;
    if (role === "student") {
      if (gender) storedGender = normalizeGender(gender) ?? (gender === "other" ? "other" : null);
      if (gender && !storedGender) {
        return new Response(JSON.stringify({ error: "Sexe non reconnu (M ou F)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (storedDob) {
        const iso = normalizeDob(storedDob);
        if (!iso || !dobIsPlausible(iso)) {
          return new Response(
            JSON.stringify({ error: "Date de naissance invalide (âge entre 3 et 35 ans)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        storedDob = iso;
      }
    }

    // nov3: family-first school. The database is the only place that knows the level order.
    let familyManaged = false;
    if (role === "student" && classId) {
      const { data: isFam } = await admin.rpc("ef_class_is_family_level", { p_class: classId });
      familyManaged = isFam === true;
    }

    const base = `${slugify(firstName)}.${slugify(lastName)}` || "utilisateur";
    const suffix = Math.floor(Math.random() * 900 + 100);
    const username = `${base}${suffix}`;
    const email = `${username}@edufaso.local`;
    const tempPassword = familyManaged ? lockedPassword() : randomPassword(10);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      ...(familyManaged ? { ban_duration: LOCKED_BAN_DURATION } : {}),
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        must_change_password: !familyManaged,
      },
      app_metadata: {
        role,
        school_id: schoolId,
      },
    });

    if (createError || !created.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? "Création échouée" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const newUserId = created.user.id;

    await admin
      .from("profils")
      .upsert({
        id: newUserId,
        first_name: firstName,
        last_name: lastName,
        email: role === "parent" && contactEmail ? contactEmail : email,
        phone,
        date_of_birth: storedDob,
        gender: storedGender,
        address,
        matricule,
        must_change_password: !familyManaged,
        family_managed: familyManaged,
        active: true,
      });

    await admin.from("roles_utilisateurs").insert({
      user_id: newUserId,
      role,
      school_id: role === "super_admin" ? null : schoolId,
      active: true,
    });

    if (!familyManaged) {
      await admin.from("identifiants_temporaires").insert({
        user_id: newUserId,
        username,
        temp_password_hint: tempPassword,
        used: false,
      });
    }

    // F-15: audit trail for account creation (best effort).
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "create_user",
      entity_type: "user",
      entity_id: newUserId,
      details: {
        role,
        school_id: role === "super_admin" ? null : schoolId,
        ...(familyManaged ? { family_managed: true } : {}),
      },
    });

    if (role === "student" && classId) {
      let yearId = academicYearId;
      if (!yearId) {
        const { data: cls } = await admin
          .from("classes")
          .select("academic_year_id")
          .eq("id", classId)
          .maybeSingle();
        yearId = (cls?.academic_year_id as string | undefined) ?? null;
      }
      if (yearId) {
        await admin.from("inscriptions").insert({
          student_id: newUserId,
          class_section_id: classId,
          academic_year_id: yearId,
          status: "active",
        });
      }
    }

    if (role === "teacher" && classId && subjectId) {
      await admin.from("affectations_enseignement").insert({
        teacher_id: newUserId,
        class_section_id: classId,
        subject_id: subjectId,
      });
    }

    if (role === "parent" && studentId) {
      await admin.from("liens_parent_eleve").insert({
        parent_id: newUserId,
        student_id: studentId,
        relationship,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUserId,
        // family-first pupil: no login exists, nothing to hand out (the parent is the only account)
        username: familyManaged ? "" : username,
        tempPassword: familyManaged ? "" : tempPassword,
        email,
        role,
        familyManaged,
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
