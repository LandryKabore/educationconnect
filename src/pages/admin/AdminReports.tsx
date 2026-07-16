import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Mail, School as SchoolIcon, UserX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import { schoolTypeLabel } from "@/lib/schoolForm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default function AdminReports() {
  const { data: schools = [], isLoading: loadingSchools } = useQuery({
    queryKey: ["ecoles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ecoles").select("*").order("name");
      if (error) throw error;
      return data as School[];
    },
  });

  const { data: adminRoles = [] } = useQuery({
    queryKey: ["admin-reports-school-admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles_utilisateurs")
        .select("school_id")
        .eq("role", "school_admin")
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pendingInvitesCount = 0 } = useQuery({
    queryKey: ["admin-pending-invites-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });

  const schoolsWithAdmin = new Set(
    adminRoles.map((r) => r.school_id).filter(Boolean) as string[],
  );

  const withoutAdmin = schools.filter((s) => s.active && !schoolsWithAdmin.has(s.id));
  const inactiveSchools = schools.filter((s) => !s.active);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCount = schools.filter(
    (s) => new Date(s.created_at) >= thirtyDaysAgo,
  ).length;

  return (
    <div>
      <PageHeader
        title="Rapports"
        subtitle="Vue d'ensemble et alertes de la plateforme"
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <UserX className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{withoutAdmin.length}</p>
            <p className="text-sm text-slate-500">Écoles sans admin actif</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-800">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{inactiveSchools.length}</p>
            <p className="text-sm text-slate-500">Écoles inactives</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{recentCount}</p>
            <p className="text-sm text-slate-500">Créées (30 derniers jours)</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{pendingInvitesCount}</p>
            <p className="text-sm text-slate-500">Invitations en attente</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <UserX className="h-5 w-5 text-amber-700" />
            <h2 className="font-semibold">Écoles actives sans administrateur</h2>
          </div>
          {loadingSchools ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : withoutAdmin.length === 0 ? (
            <EmptyState message="Toutes les écoles actives ont un administrateur." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-3 font-medium">École</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 font-medium">Ville</th>
                  </tr>
                </thead>
                <tbody>
                  {withoutAdmin.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        <Link
                          to={`/admin/ecoles/${s.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {schoolTypeLabel(s.school_type)}
                      </td>
                      <td className="py-2 text-slate-600">{s.city ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <SchoolIcon className="h-5 w-5 text-red-700" />
            <h2 className="font-semibold">Écoles inactives</h2>
          </div>
          {loadingSchools ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : inactiveSchools.length === 0 ? (
            <EmptyState message="Aucune école inactive." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 pr-3 font-medium">École</th>
                    <th className="pb-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveSchools.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        <Link
                          to={`/admin/ecoles/${s.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <Badge tone="danger">Inactive</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
