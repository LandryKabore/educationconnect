import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Headphones, Lock, RefreshCw, Unlock } from "lucide-react";
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
} from "@/components/ui";

type UserWithRoles = Profile & {
  roles: UserRoleRow[];
  schoolNames: string[];
};

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
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profils, error: pErr }, { data: roles, error: rErr }, { data: schools, error: sErr }] =
        await Promise.all([
          supabase.from("profils").select("*").order("created_at", { ascending: false }),
          supabase.from("roles_utilisateurs").select("*"),
          supabase.from("ecoles").select("id, name"),
        ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      if (sErr) throw sErr;

      const schoolMap = new Map((schools ?? []).map((s) => [s.id, s.name as string]));
      const rolesByUser = new Map<string, UserRoleRow[]>();
      for (const role of (roles ?? []) as UserRoleRow[]) {
        const list = rolesByUser.get(role.user_id) ?? [];
        list.push(role);
        rolesByUser.set(role.user_id, list);
      }

      return ((profils ?? []) as Profile[]).map((p) => {
        const userRoles = rolesByUser.get(p.id) ?? [];
        const schoolNames = [
          ...new Set(
            userRoles
              .map((r) => (r.school_id ? schoolMap.get(r.school_id) : null))
              .filter(Boolean) as string[],
          ),
        ];
        return { ...p, roles: userRoles, schoolNames };
      }) as UserWithRoles[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = fullName(u.first_name, u.last_name).toLowerCase();
      return name.includes(q) || (u.email ?? "").toLowerCase().includes(q);
    });
  }, [users, search]);

  const runAction = async (userId: string, action: string) => {
    setBusyId(userId);
    try {
      const res = await invokeUserAction(action, userId);
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
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusyId(null);
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

      <div className="mb-4">
        <Input
          placeholder="Rechercher par nom ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState message="Aucun utilisateur trouvé." />
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => {
            const activeRoles = u.roles.filter((r) => r.active);
            const schoolAdminRole = activeRoles.find(
              (r) => r.role === "school_admin" && r.school_id,
            );
            const busy = busyId === u.id;

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
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {schoolAdminRole?.school_id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
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
                      disabled={busy || u.active}
                      onClick={() => void runAction(u.id, "unlock")}
                    >
                      <Unlock className="h-4 w-4" />
                      Déverrouiller
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || !u.active}
                      onClick={() => void runAction(u.id, "lock")}
                    >
                      <Lock className="h-4 w-4" />
                      Verrouiller
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void runAction(u.id, "force_password_change")}
                    >
                      Forcer MDP
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void runAction(u.id, "reset_password")}
                    >
                      Réinitialiser MDP
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
