import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  ClipboardList,
  CreditCard,
  Mail,
  Plus,
  School,
  Settings,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { schoolTypeLabel } from "@/lib/schoolForm";
import type { School as SchoolRow } from "@/lib/types";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { PortalGreeting } from "@/components/PortalGreeting";

const ADMIN_LINKS = [
  {
    to: "/admin/ecoles",
    title: "Gérer les écoles",
    description: "Créer, modifier, activer / désactiver",
    icon: School,
  },
  {
    to: "/admin/utilisateurs",
    title: "Utilisateurs",
    description: "Comptes, rôles et actions de support",
    icon: Users,
  },
  {
    to: "/admin/invitations",
    title: "Invitations",
    description: "En attente et récemment acceptées",
    icon: Mail,
  },
  {
    to: "/admin/parametres",
    title: "Paramètres",
    description: "Configuration globale de la plateforme",
    icon: Settings,
  },
  {
    to: "/admin/rapports",
    title: "Rapports",
    description: "Alertes et statistiques",
    icon: ClipboardList,
  },
  {
    to: "/admin/audit",
    title: "Journal d'audit",
    description: "Historique des actions",
    icon: Shield,
  },
  {
    to: "/admin/abonnements",
    title: "Abonnements",
    description: "Plans et facturation par école",
    icon: CreditCard,
  },
  {
    to: "/admin/super-admins",
    title: "Super admins",
    description: "Inviter et gérer les super administrateurs",
    icon: UserCog,
  },
] as const;

export default function AdminDashboard() {
  const qc = useQueryClient();

  const { data: schools = [], isLoading: loadingSchools } = useQuery({
    queryKey: ["ecoles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ecoles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SchoolRow[];
    },
  });

  const { data: adminCount = 0 } = useQuery({
    queryKey: ["admin-school-admin-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("roles_utilisateurs")
        .select("id", { count: "exact", head: true })
        .eq("role", "school_admin")
        .eq("active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["admin-pending-invites"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, first_name, last_name, school_id, expires_at, created_at, ecoles(name)")
        .eq("role", "school_admin")
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeSchools = schools.filter((s) => s.active).length;
  const inactiveSchools = schools.length - activeSchools;

  return (
    <div>
      <PortalGreeting />
      <PageHeader
        title="Tableau de bord"
        subtitle="Super administration EduFaso"
        actions={
          <Link to="/admin/ecoles">
            <Button>
              <Plus className="h-4 w-4" />
              Nouvelle école
            </Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <School className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{schools.length}</p>
            <p className="text-sm text-slate-500">Écoles</p>
            <p className="text-xs text-slate-400">
              {activeSchools} actives · {inactiveSchools} inactives
            </p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{adminCount}</p>
            <p className="text-sm text-slate-500">Admins d'école</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{pendingInvites.length}</p>
            <p className="text-sm text-slate-500">Invitations en attente</p>
          </div>
        </Card>
        <Card className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{activeSchools}</p>
            <p className="text-sm text-slate-500">Écoles actives</p>
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ADMIN_LINKS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to}>
            <Card className="flex h-full items-start gap-3 transition hover:border-brand-300">
              <Icon className="h-5 w-5 shrink-0 text-brand-700" />
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-slate-500">{description}</p>
              </div>
            </Card>
          </Link>
        ))}
        <button
          type="button"
          className="text-left"
          onClick={() => {
            void qc.invalidateQueries();
            toast.success("Données actualisées");
          }}
        >
          <Card className="flex h-full items-start gap-3 transition hover:border-brand-300">
            <Mail className="h-5 w-5 text-brand-700" />
            <div>
              <h3 className="font-semibold">Actualiser</h3>
              <p className="text-sm text-slate-500">Recharger stats et invitations</p>
            </div>
          </Card>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Écoles récentes</h2>
            <Link to="/admin/ecoles" className="text-sm text-brand-700 hover:underline">
              Tout voir
            </Link>
          </div>
          {loadingSchools ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : schools.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune école pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {schools.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/admin/ecoles/${s.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-brand-300"
                  >
                    <span>
                      <span className="font-medium">{s.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {[schoolTypeLabel(s.school_type), s.city]
                          .filter((x) => x && x !== "—")
                          .join(" · ")}
                      </span>
                    </span>
                    <Badge tone={s.active ? "success" : "danger"}>
                      {s.active ? "Active" : "Inactive"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Invitations en attente</h2>
            <Link to="/admin/invitations" className="text-sm text-brand-700 hover:underline">
              Tout voir
            </Link>
          </div>
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune invitation en cours.</p>
          ) : (
            <ul className="space-y-2">
              {pendingInvites.map((inv) => {
                const schoolName =
                  (inv as { ecoles?: { name?: string } | null }).ecoles?.name ??
                  "École";
                return (
                  <li
                    key={inv.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {inv.first_name} {inv.last_name}
                    </p>
                    <p className="text-xs text-slate-600">{inv.email}</p>
                    <p className="mt-1 text-xs text-slate-500">{schoolName}</p>
                    <Link
                      to={`/admin/ecoles/${inv.school_id}`}
                      className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
                    >
                      Voir l'école
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
