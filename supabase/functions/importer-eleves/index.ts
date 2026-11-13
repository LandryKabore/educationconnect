import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  dobIsPlausible,
  LOCKED_BAN_DURATION,
  lockedPassword,
  normalizeDob,
  normalizeGender,
  phoneIsUsable,
} from "../_shared/famille.ts";

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

/** "prenom.nom" login base; `fallback` only when neither name has a usable character. */
function usernameBase(firstName: string, lastName: string, fallback: string) {
  const first = slugify(firstName);
  const last = slugify(lastName);
  return first || last ? `${first}.${last}` : fallback;
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
  // nov3 (all optional): identity + parent
  gender?: string | null;
  dateOfBirth?: string | null;
  matricule?: string | null;
  parentFirstName?: string | null;
  parentLastName?: string | null;
  parentPhone?: string | null;
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
      /** true = family-first school: no login was created for this pupil (parent only) */
      familyManaged: boolean;
    }[] = [];
    const parents: {
      line: number | null;
      childName: string;
      firstName: string;
      lastName: string;
      phone: string;
      username: string;
      tempPassword: string;
      /** true = an existing parent of the school was linked (no new account) */
      existing: boolean;
    }[] = [];
    const warnings: { line: number | null; firstName: string; lastName: string; message: string }[] = [];
    const familyCache = new Map<string, boolean>();
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

      // ---- nov3: identity (validated here too, never trust the browser)
      const rawGender = raw.gender != null ? String(raw.gender).trim() : "";
      const gender = normalizeGender(rawGender);
      if (rawGender && !gender) {
        failed.push({ line, firstName, lastName, error: `Sexe non reconnu : ${rawGender} (M ou F)` });
        continue;
      }
      const rawDob = raw.dateOfBirth != null ? String(raw.dateOfBirth).trim() : "";
      const dob = normalizeDob(rawDob);
      if (rawDob && (!dob || !dobIsPlausible(dob))) {
        failed.push({
          line,
          firstName,
          lastName,
          error: `Date de naissance invalide : ${rawDob} (jj/mm/aaaa, âge entre 3 et 35 ans)`,
        });
        continue;
      }
      const matricule = raw.matricule ? String(raw.matricule).trim().slice(0, 40) || null : null;
      const parentFirst = String(raw.parentFirstName ?? "").trim();
      const parentLast = String(raw.parentLastName ?? "").trim();
      const parentPhone = String(raw.parentPhone ?? "").trim();
      const wantsParent = Boolean(parentFirst || parentLast || parentPhone);
      if (wantsParent && !phoneIsUsable(parentPhone)) {
        failed.push({
          line,
          firstName,
          lastName,
          error: "Téléphone du parent obligatoire (8 chiffres au moins) pour créer ou relier le parent",
        });
        continue;
      }

      // ---- nov3: family-first school? (the database is the only place that knows the level order)
      const classKey = String(cls.id);
      if (!familyCache.has(classKey)) {
        const { data: isFam } = await admin.rpc("ef_class_is_family_level", { p_class: cls.id });
        familyCache.set(classKey, isFam === true);
      }
      const familyManaged = familyCache.get(classKey) === true;

      const base = usernameBase(firstName, lastName, "eleve");
      const suffix = Math.floor(Math.random() * 900 + 100);
      const username = `${base}${suffix}`;
      const email = `${username}@edufaso.local`;
      // family-managed pupil: random password nobody knows + locked account (the parent is the only login)
      const tempPassword = familyManaged ? lockedPassword() : randomPassword(10);

      const { data: authUser, error: createError } = await admin.auth.admin.createUser({
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

      // any failure below removes the half-created account, so a failed line leaves nothing behind
      const rollbackUser = async (message: string) => {
        await admin.auth.admin.deleteUser(newUserId);
        failed.push({ line, firstName, lastName, error: message });
      };

      const { error: profilError } = await admin.from("profils").upsert({
        id: newUserId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        gender,
        date_of_birth: dob,
        matricule,
        must_change_password: !familyManaged,
        family_managed: familyManaged,
        active: true,
      });
      if (profilError) {
        await rollbackUser(`Profil non créé : ${profilError.message}`);
        continue;
      }

      const { error: roleError } = await admin.from("roles_utilisateurs").insert({
        user_id: newUserId,
        role: "student",
        school_id: schoolId,
        active: true,
      });
      if (roleError) {
        await rollbackUser(`Rôle non créé : ${roleError.message}`);
        continue;
      }

      if (!familyManaged) {
        const { error: credError } = await admin.from("identifiants_temporaires").insert({
          user_id: newUserId,
          username,
          temp_password_hint: tempPassword,
          used: false,
        });
        if (credError) {
          await rollbackUser(`Identifiants non créés : ${credError.message}`);
          continue;
        }
      }

      const { error: inscError } = await admin.from("inscriptions").insert({
        student_id: newUserId,
        class_section_id: cls.id,
        academic_year_id: cls.academic_year_id,
        status: "active",
      });
      if (inscError) {
        await rollbackUser(`Inscription non créée : ${inscError.message}`);
        continue;
      }

      // ---- nov3: parent (create or link). Siblings with the same parent phone share one parent.
      if (wantsParent) {
        let parentId = (await admin.rpc("ef_find_parent_by_phone", { p_school: schoolId, p_phone: parentPhone }))
          .data as string | null;
        let existing = Boolean(parentId);
        let parentUsername = "";
        let parentTemp = "";
        if (!parentId) {
          if (!parentFirst || !parentLast) {
            warnings.push({
              line,
              firstName,
              lastName,
              message: "Parent non créé : prénom et nom du parent requis (aucun parent n'a ce téléphone)",
            });
          } else {
            const pBase = usernameBase(parentFirst, parentLast, "parent");
            parentUsername = `${pBase}${Math.floor(Math.random() * 900 + 100)}`;
            const pEmail = `${parentUsername}@edufaso.local`;
            parentTemp = randomPassword(10);
            const { data: pAuth, error: pErr } = await admin.auth.admin.createUser({
              email: pEmail,
              password: parentTemp,
              email_confirm: true,
              user_metadata: { first_name: parentFirst, last_name: parentLast, must_change_password: true },
              app_metadata: { role: "parent", school_id: schoolId },
            });
            if (pErr || !pAuth.user) {
              warnings.push({ line, firstName, lastName, message: `Parent non créé : ${pErr?.message ?? "erreur"}` });
            } else {
              const pid = pAuth.user.id;
              const { error: e1 } = await admin.from("profils").upsert({
                id: pid,
                first_name: parentFirst,
                last_name: parentLast,
                email: pEmail,
                phone: parentPhone,
                must_change_password: true,
                active: true,
              });
              const { error: e2 } = e1
                ? { error: e1 }
                : await admin
                    .from("roles_utilisateurs")
                    .insert({ user_id: pid, role: "parent", school_id: schoolId, active: true });
              const { error: e3 } = e2
                ? { error: e2 }
                : await admin.from("identifiants_temporaires").insert({
                    user_id: pid,
                    username: parentUsername,
                    temp_password_hint: parentTemp,
                    used: false,
                  });
              if (e3) {
                await admin.auth.admin.deleteUser(pid);
                warnings.push({ line, firstName, lastName, message: `Parent non créé : ${e3.message}` });
              } else {
                parentId = pid;
                await admin.from("audit_logs").insert({
                  actor_id: user.id,
                  action: "create_user",
                  entity_type: "user",
                  entity_id: pid,
                  details: { role: "parent", school_id: schoolId, via: "importer-eleves" },
                });
              }
            }
          }
        }
        if (parentId) {
          const { error: linkError } = await admin
            .from("liens_parent_eleve")
            .insert({ parent_id: parentId, student_id: newUserId, relationship: "parent" });
          if (linkError) {
            warnings.push({ line, firstName, lastName, message: `Parent non relié : ${linkError.message}` });
          } else {
            parents.push({
              line,
              childName: `${firstName} ${lastName}`,
              firstName: parentFirst,
              lastName: parentLast,
              phone: parentPhone,
              username: parentUsername,
              tempPassword: parentTemp,
              existing,
            });
          }
        }
      }
      if (familyManaged && !wantsParent) {
        warnings.push({
          line,
          firstName,
          lastName,
          message: "Compte famille sans parent : personne ne peut encore voir cet élève. Créez le parent dans Parents.",
        });
      }

      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "create_user",
        entity_type: "user",
        entity_id: newUserId,
        details: { role: "student", school_id: schoolId, via: "importer-eleves", family_managed: familyManaged },
      });

      created.push({
        line,
        firstName,
        lastName,
        className: String(cls.name),
        username: familyManaged ? "" : username,
        tempPassword: familyManaged ? "" : tempPassword,
        userId: newUserId,
        familyManaged,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        created,
        failed,
        parents,
        warnings,
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
