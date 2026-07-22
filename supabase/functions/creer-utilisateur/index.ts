import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function randomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = crypto.getRandomValues(new Uint8Array(length));
  for (const n of arr) out += chars[n % chars.length];
  return out;
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

    const firstSlug = slugify(firstName);
    const lastSlug = slugify(lastName);
    // A template literal like `${a}.${b}` is never an empty string (the "."
    // always survives), so `|| "utilisateur"` never triggered even when both
    // names produced empty slugs (e.g. non-latin characters) — check the
    // parts themselves instead.
    const base =
      firstSlug || lastSlug ? `${firstSlug}.${lastSlug}` : "utilisateur";
    const suffix = Math.floor(Math.random() * 900 + 100);
    const username = `${base}${suffix}`;
    const email = `${username}@edufaso.local`;
    const tempPassword = randomPassword(10);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        must_change_password: true,
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
        date_of_birth: dateOfBirth || null,
        gender,
        address,
        matricule,
        must_change_password: true,
        active: true,
      });

    await admin.from("roles_utilisateurs").insert({
      user_id: newUserId,
      role,
      school_id: role === "super_admin" ? null : schoolId,
      active: true,
    });

    await admin.from("identifiants_temporaires").insert({
      user_id: newUserId,
      username,
      temp_password_hint: tempPassword,
      used: false,
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
        username,
        tempPassword,
        email,
        role,
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
