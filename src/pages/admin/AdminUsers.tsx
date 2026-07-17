import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Headphones, Loader2, Lock, RefreshCw, Unlock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS, type AppRole, type Profile, type UserRoleRow } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";

type UserWithRoles = Profile & {
  roles: UserRoleRow[];
  schoolNames: string[];
  schoolIds: string[];
  classId: string | null;
  className: string | null;
  classSchoolId: string | null;
};

type RoleFilter = AppRole | "none";
type ClassFilter = "" | "__none__" | string;

const ROLE_FILTER_ORDER: RoleFilter[] = [
  "super_admin",
  "school_admin",
  "teacher",
  "student",
  "parent",
  "none",
];

const ROLES_WITH_SCHOOL_FILTER: RoleFilter[] = [
  "school_admin",
  "teacher",
  "student",
];

function roleFilterLabel(filter: RoleFilter) {
  if (filter === "none") return "Sans rôle actif";
  return ROLE_LABELS[filter];
}

function userMatchesRole(u: UserWithRoles, filter: RoleFilter) {
  const activeRoles = u.roles.filter((r) => r.active);
  if (filter === "none") return activeRoles.length === 0;
  return activeRoles.some((r) => r.role === filter);
}

function userMatchesSchool(
  u: UserWithRoles,
  role: RoleFilter,
  schoolId: string,
) {
  if (!schoolId) return true;
  if (!ROLES_WITH_SCHOOL_FILTER.includes(role)) return true;
  return u.roles.some(
    (r) => r.active && r.role === role && r.school_id === schoolId,
  );
}

function userMatchesClass(u: UserWithRoles, classFilter: ClassFilter) {
  if (!classFilter) return true;
  if (classFilter === "__none__") return !u.classId;
  return u.classId === classFilter;
}

async function invokeUserAction(action: string, userId: string) {
  const { data, error } = await supabase.functions.invoke("support-user-action", {
    body: { action, userId },
  });
  if (error) throw error;
  const res = data as { success?: boolean; error?: string; tempPassword?: string };
  if (res.error) throw new Error(res.error);
  return res;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("school_admin");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [classFilter, setClassFilter] = useState<ClassFilter>("");
  const [busy, setBusy] = useState<{ userId: string; action: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [
        { data: profils, error: pErr },
        { data: roles, error: rErr },
        { data: schools, error: sErr },
        { data: classes, error: cErr },
        { data: inscriptions, error: iErr },
      ] = await Promise.all([
        supabase.from("profils").select("*").order("created_at", { ascending: false }),
        supabase.from("roles_utilisateurs").select("*"),
        supabase.from("ecoles").select("id, name").order("name"),
        supabase.from("classes").select("id, name, school_id").order("name"),
        supabase
          .from("inscriptions")
          .select("student_id, class_section_id, status")
          .eq("status", "active"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      if (sErr) throw sErr;
      if (cErr) throw cErr;
      if (iErr) throw iErr;

      const schoolList = (schools ?? []).map((s) => ({
        id: s.id as string,
        name: s.name as string,
      }));
      const schoolMap = new Map(schoolList.map((s) => [s.id, s.name]));
      const classList = (classes ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        schoolId: c.school_id as string,
      }));
      const classMap = new Map(classList.map((c) => [c.id, c]));

      const enrollmentByStudent = new Map<
        string,
        { classId: string; className: string; classSchoolId: string }
      >();
      for (const row of inscriptions ?? []) {
        const classId = row.class_section_id as string;
        const cls = classMap.get(classId);
        if (!cls) continue;
        enrollmentByStudent.set(row.student_id as string, {
          classId: cls.id,
          className: cls.name,
          classSchoolId: cls.schoolId,
        });
      }

      const rolesByUser = new Map<string, UserRoleRow[]>();
      for (const role of (roles ?? []) as UserRoleRow[]) {
        const list = rolesByUser.get(role.user_id) ?? [];
        list.push(role);
        rolesByUser.set(role.user_id, list);
      }

      const users = ((profils ?? []) as Profile[]).map((p) => {
        const userRoles = rolesByUser.get(p.id) ?? [];
        const schoolIds = [
          ...new Set(
            userRoles
              .filter((r) => r.active && r.school_id)
              .map((r) => r.school_id as string),
          ),
        ];
        const schoolNames = schoolIds
          .map((id) => schoolMap.get(id))
          .filter(Boolean) as string[];
        const enrollment = enrollmentByStudent.get(p.id);
        return {
          ...p,
          roles: userRoles,
          schoolNames,
          schoolIds,
          classId: enrollment?.classId ?? null,
          className: enrollment?.className ?? null,
          classSchoolId: enrollment?.classSchoolId ?? null,
        };
      }) as UserWithRoles[];

      return { users, schools: schoolList, classes: classList };
    },
  });

  const users = data?.users ?? [];
  const schools = data?.schools ?? [];
  const classes = data?.classes ?? [];
  const showSchoolFilter = ROLES_WITH_SCHOOL_FILTER.includes(roleFilter);
  const showClassFilter = roleFilter === "student";

  const setRole = (role: RoleFilter) => {
    setRoleFilter(role);
    setClassFilter("");
    if (!ROLES_WITH_SCHOOL_FILTER.includes(role)) setSchoolFilter("");
  };

  const setSchool = (schoolId: string) => {
    setSchoolFilter(schoolId);
    setClassFilter("");
  };

  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ROLE_FILTER_ORDER.map((r) => [r, 0]),
    ) as Record<RoleFilter, number>;
    for (const u of users) {
      for (const filter of ROLE_FILTER_ORDER) {
        if (userMatchesRole(u, filter)) counts[filter] += 1;
      }
    }
    return counts;
  }, [users]);

  const schoolOptions = useMemo(() => {
    if (!showSchoolFilter) return [];
    return schools
      .map((s) => ({
        ...s,
        count: users.filter(
          (u) =>
            userMatchesRole(u, roleFilter) &&
            userMatchesSchool(u, roleFilter, s.id),
        ).length,
      }))
      .filter((s) => s.count > 0);
  }, [schools, users, roleFilter, showSchoolFilter]);

  const studentsForClassOptions = useMemo(() => {
    return users
      .filter((u) => userMatchesRole(u, "student"))
      .filter((u) => userMatchesSchool(u, "student", schoolFilter));
  }, [users, schoolFilter]);

  const classOptions = useMemo(() => {
    if (!showClassFilter) return { listed: [], noneCount: 0 };
    const counts = new Map<string, number>();
    let noneCount = 0;
    for (const u of studentsForClassOptions) {
      if (!u.classId) {
        noneCount += 1;
        continue;
      }
      counts.set(u.classId, (counts.get(u.classId) ?? 0) + 1);
    }

    const listed = classes
      .filter((c) => !schoolFilter || c.schoolId === schoolFilter)
      .filter((c) => (counts.get(c.id) ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        schoolId: c.schoolId,
        count: counts.get(c.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return { listed, noneCount };
  }, [showClassFilter, classes, schoolFilter, studentsForClassOptions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => userMatchesRole(u, roleFilter))
      .filter((u) => userMatchesSchool(u, roleFilter, schoolFilter))
      .filter((u) =>
        roleFilter === "student" ? userMatchesClass(u, classFilter) : true,
      )
      .filter((u) => {
        if (!q) return true;
        const name = fullName(u.first_name, u.last_name).toLowerCase();
        return name.includes(q) || (u.email ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) =>
        fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
        ),
      );
  }, [users, search, roleFilter, schoolFilter, classFilter]);

  const selectedSchoolName = schoolFilter
    ? schools.find((s) => s.id === schoolFilter)?.name
    : null;

  const selectedClassLabel =
    classFilter === "__none__"
      ? "Sans classe"
      : classFilter
        ? classes.find((c) => c.id === classFilter)?.name
        : null;

  const runAction = async (userId: string, action: string) => {
    setBusy({ userId, action });
    const loadingToast = toast.loading(
      action === "lock"
        ? "Verrouillage…"
        : action === "unlock"
          ? "Déverrouillage…"
          : action === "reset_password"
            ? "Réinitialisation…"
            : "Traitement…",
    );
    try {
      const res = await invokeUserAction(action, userId);
      toast.dismiss(loadingToast);
      if (action === "reset_password" && res.tempPassword) {
        toast.success("Mot de passe temporaire généré", {
          description: res.tempPassword,
          action: {
            label: "Copier",
            onClick: () => void navigator.clipboard.writeText(res.tempPassword!),
          },
          duration: 30_000,
        });
      } else if (action === "lock") {
        toast.success("Compte verrouillé");
      } else if (action === "unlock") {
        toast.success("Compte déverrouillé");
      } else if (action === "force_password_change") {
        toast.success("Changement de mot de passe requis au prochain accès");
      }
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(null);
    }
  };

  const enterSupport = (schoolId: string) => {
    if (auth.enterSupportMode) {
      auth.enterSupportMode(schoolId);
    } else {
      sessionStorage.setItem("ef_support_school", schoolId);
    }
    navigate("/ecole");
  };

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        subtitle="Gérer les comptes et rôles de la plateforme"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void qc.invalidateQueries({ queryKey: ["admin-users"] })}
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-64">
          <Select
            value={roleFilter}
            onChange={(e) => setRole(e.target.value as RoleFilter)}
            aria-label="Filtrer par rôle"
          >
            {ROLE_FILTER_ORDER.map((role) => (
              <option key={role} value={role}>
                {roleFilterLabel(role)} ({roleCounts[role]})
              </option>
            ))}
          </Select>
        </div>
        {showSchoolFilter ? (
          <div className="sm:w-64">
            <Select
              value={schoolFilter}
              onChange={(e) => setSchool(e.target.value)}
              aria-label="Filtrer par école"
            >
              <option value="">Toutes les écoles</option>
              {schoolOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.count})
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {showClassFilter ? (
          <div className="sm:w-64">
            <Select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value as ClassFilter)}
              aria-label="Filtrer par classe"
            >
              <option value="">Toutes les classes</option>
              {classOptions.noneCount > 0 ? (
                <option value="__none__">
                  Sans classe ({classOptions.noneCount})
                </option>
              ) : null}
              {classOptions.listed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.count})
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <Input
          className="flex-1"
          placeholder="Rechercher par nom ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            selectedClassLabel
              ? `Aucun élève dans « ${selectedClassLabel} »${selectedSchoolName ? ` (${selectedSchoolName})` : ""}.`
              : selectedSchoolName
                ? `Aucun ${roleFilterLabel(roleFilter).toLowerCase()} pour « ${selectedSchoolName} ».`
                : `Aucun utilisateur « ${roleFilterLabel(roleFilter)} » trouvé.`
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {filtered.length} utilisateur{filtered.length > 1 ? "s" : ""} —{" "}
            {roleFilterLabel(roleFilter)}
            {selectedSchoolName ? ` · ${selectedSchoolName}` : ""}
            {selectedClassLabel ? ` · ${selectedClassLabel}` : ""}
          </p>
          {filtered.map((u) => {
            const activeRoles = u.roles.filter((r) => r.active);
            const schoolAdminRole = activeRoles.find(
              (r) => r.role === "school_admin" && r.school_id,
            );
            const rowBusy = busy?.userId === u.id;
            const actionBusy = (action: string) =>
              rowBusy && busy?.action === action;

            return (
              <Card key={u.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {fullName(u.first_name, u.last_name)}
                      </h3>
                      <Badge tone={u.active ? "success" : "danger"}>
                        {u.active ? "Actif" : "Inactif"}
                      </Badge>
                      {u.must_change_password ? (
                        <Badge tone="warning">MDP à changer</Badge>
                      ) : null}
                    </div>
                    {u.email ? (
                      <p className="mt-0.5 text-sm text-slate-500">{u.email}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeRoles.length === 0 ? (
                        <Badge tone="default">Aucun rôle actif</Badge>
                      ) : (
                        activeRoles.map((r) => (
                          <Badge key={r.id} tone="info">
                            {ROLE_LABELS[r.role as AppRole] ?? r.role}
                          </Badge>
                        ))
                      )}
                    </div>
                    {u.schoolNames.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        École(s) : {u.schoolNames.join(", ")}
                      </p>
                    ) : null}
                    {roleFilter === "student" ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Classe : {u.className ?? "Sans classe"}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {schoolAdminRole?.school_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rowBusy}
                        onClick={() => enterSupport(schoolAdminRole.school_id!)}
                      >
                        <Headphones className="h-4 w-4" />
                        Mode support
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rowBusy || u.active}
                      onClick={() => void runAction(u.id, "unlock")}
                    >
                      {actionBusy("unlock") ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="h-4 w-4" />
                      )}
                      {actionBusy("unlock") ? "Déverrouillage…" : "Déverrouiller"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rowBusy || !u.active}
                      onClick={() => void runAction(u.id, "lock")}
                    >
                      {actionBusy("lock") ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      {actionBusy("lock") ? "Verrouillage…" : "Verrouiller"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => void runAction(u.id, "force_password_change")}
                    >
                      {actionBusy("force_password_change") ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {actionBusy("force_password_change")
                        ? "Traitement…"
                        : "Forcer MDP"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => void runAction(u.id, "reset_password")}
                    >
                      {actionBusy("reset_password") ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {actionBusy("reset_password")
                        ? "Réinitialisation…"
                        : "Réinitialiser MDP"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
