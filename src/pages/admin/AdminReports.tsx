import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { School as SchoolIcon, UserX } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import { schoolTypeLabel } from "@/lib/schoolForm";
import { Badge, Card, EmptyState } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";
import { AdminCardHeader } from "@/components/admin/AdminKit";

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
      <PageBanner
        title="Rapports"
        subtitle="Vue d'ensemble et alertes de la plateforme"
        stats={[
          { label: "Sans admin actif", value: String(withoutAdmin.length), hint: "écoles actives" },
          { label: "Inactives", value: String(inactiveSchools.length), hint: "écoles" },
          { label: "Nouvelles", value: String(recentCount), hint: "30 derniers jours" },
          { label: "Invitations", value: String(pendingInvitesCount), hint: "en attente", to: "/admin/invitations" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <AdminCardHeader icon={UserX} title="Écoles actives sans administrateur" subtitle="Invitez un administrateur depuis la fiche de l’école." />
          {loadingSchools ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : withoutAdmin.length === 0 ? (
            <EmptyState message="Toutes les écoles actives ont un administrateur." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="pb-2 pr-3 font-semibold">École</th>
                    <th className="pb-2 pr-3 font-semibold">Type</th>
                    <th className="pb-2 font-semibold">Ville</th>
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
          <AdminCardHeader icon={SchoolIcon} title="Écoles inactives" subtitle="Plus personne ne peut s’y connecter." />
          {loadingSchools ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : inactiveSchools.length === 0 ? (
            <EmptyState message="Aucune école inactive." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="pb-2 pr-3 font-semibold">École</th>
                    <th className="pb-2 font-semibold">Statut</th>
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
