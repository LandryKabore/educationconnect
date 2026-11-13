import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Headphones, Loader2, Lock, RefreshCw, Unlock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LABELS, type AppRole } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  fetchAdminUsersFacets,
  fetchAdminUsersPage,
} from "@/lib/scaleApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";

const PAGE = 50;

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

  // The user list is searched and paged by the database (50 at a time); the role / school /
  // class counts come from one small facets query.  The old page downloaded every profile,
  // role and enrollment in the platform, which is cut at 1,000 rows by the API.
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: facets } = useQuery({
    queryKey: ["admin-users", "facets", roleFilter, schoolFilter],
    queryFn: () => fetchAdminUsersFacets(roleFilter, schoolFilter || undefined),
    placeholderData: keepPreviousData,
  });

  const {
    data: pages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["admin-users", "page", roleFilter, schoolFilter, classFilter, debouncedSearch],
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchAdminUsersPage({
        role: roleFilter,
        schoolId: schoolFilter || undefined,
        classId: roleFilter === "student" ? classFilter : "",
        search: debouncedSearch,
        limit: PAGE,
        offset: pageParam,
      }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  const filtered = useMemo(
    () => (pages?.pages ?? []).flatMap((p) => p.rows),
    [pages],
  );
  const total = pages?.pages[0]?.total ?? 0;
  const schools = facets?.schools ?? [];
  const classes = facets?.classes ?? [];
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

  const roleCount = (r: RoleFilter) => facets?.roleCounts?.[r] ?? 0;
  const schoolOptions = showSchoolFilter ? schools : [];
  const classOptions = {
    listed: showClassFilter ? classes : [],
    noneCount: showClassFilter ? (facets?.noClass ?? 0) : 0,
  };

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
                {roleFilterLabel(role)} ({roleCount(role)})
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
            {total} utilisateur{total > 1 ? "s" : ""} —{" "}
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
          {hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage
                  ? "Chargement…"
                  : `Afficher plus (${total - filtered.length} restants)`}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
