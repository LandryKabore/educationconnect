import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_ROWS = 200;

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

function normClass(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type IncomingStudent = {
  firstName?: string;
  lastName?: string;
  className?: string;
  classId?: string;
  phone?: string | null;
  line?: number;
};

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
    const schoolId = String(body.schoolId ?? body.school_id ?? "").trim();
    const defaultClassId = (body.defaultClassId ?? body.default_class_id ?? null) as
      | string
      | null;
    const students = (body.students ?? []) as IncomingStudent[];

    if (!schoolId) {
      return new Response(JSON.stringify({ error: "schoolId requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(students) || students.length === 0) {
      return new Response(JSON.stringify({ error: "Aucun élève à importer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (students.length > MAX_ROWS) {
      return new Response(
        JSON.stringify({ error: `Maximum ${MAX_ROWS} élèves par import` }),
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

    const { data: classRows } = await admin
      .from("classes")
      .select("id, name, academic_year_id")
      .eq("school_id", schoolId);

    const classes = classRows ?? [];
    const byId = new Map(classes.map((c) => [c.id as string, c]));
    const byName = new Map(
      classes.map((c) => [normClass(String(c.name)), c]),
    );

    const created: {
      line: number | null;
      firstName: string;
      lastName: string;
      className: string;
      username: string;
      tempPassword: string;
      userId: string;
    }[] = [];
    const failed: { line: number | null; firstName: string; lastName: string; error: string }[] =
      [];

    for (const raw of students) {
      const firstName = String(raw.firstName ?? "").trim();
      const lastName = String(raw.lastName ?? "").trim();
      const phone = raw.phone ? String(raw.phone).trim() : null;
      const line = typeof raw.line === "number" ? raw.line : null;

      if (!firstName || !lastName) {
        failed.push({
          line,
          firstName,
          lastName,
          error: "Prénom et nom requis",
        });
        continue;
      }

      let cls =
        (raw.classId && byId.get(String(raw.classId))) ||
        (raw.className && byName.get(normClass(String(raw.className)))) ||
        (defaultClassId ? byId.get(defaultClassId) : undefined);

      if (!cls) {
        failed.push({
          line,
          firstName,
          lastName,
          error: raw.className
            ? `Classe introuvable : ${raw.className}`
            : "Aucune classe (colonne classe ou classe par défaut)",
        });
        continue;
      }

      const firstSlug = slugify(firstName);
      const lastSlug = slugify(lastName);
      const base = firstSlug || lastSlug ? `${firstSlug}.${lastSlug}` : "eleve";
      const suffix = Math.floor(Math.random() * 900 + 100);
      const username = `${base}${suffix}`;
      const email = `${username}@edufaso.local`;
      const tempPassword = randomPassword(10);

      const { data: authUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          must_change_password: true,
        },
        app_metadata: {
          role: "student",
          school_id: schoolId,
        },
      });

      if (createError || !authUser.user) {
        failed.push({
          line,
          firstName,
          lastName,
          error: createError?.message ?? "Création Auth échouée",
        });
        continue;
      }

      const newUserId = authUser.user.id;

      await admin.from("profils").upsert({
        id: newUserId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        must_change_password: true,
        active: true,
      });

      await admin.from("roles_utilisateurs").insert({
        user_id: newUserId,
        role: "student",
        school_id: schoolId,
        active: true,
      });

      await admin.from("identifiants_temporaires").insert({
        user_id: newUserId,
        username,
        temp_password_hint: tempPassword,
        used: false,
      });

      await admin.from("inscriptions").insert({
        student_id: newUserId,
        class_section_id: cls.id,
        academic_year_id: cls.academic_year_id,
        status: "active",
      });

      created.push({
        line,
        firstName,
        lastName,
        className: String(cls.name),
        username,
        tempPassword,
        userId: newUserId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        created,
        failed,
        summary: {
          total: students.length,
          ok: created.length,
          errors: failed.length,
        },
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
