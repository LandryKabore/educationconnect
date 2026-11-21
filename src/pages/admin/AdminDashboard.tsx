import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, Mail, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { schoolTypeLabel } from "@/lib/schoolForm";
import { getTimeGreeting } from "@/lib/greeting";
import { relativeFr } from "@/lib/portalHomeFormat";
import { formatDateSafe } from "@/lib/dateFr";
import { fullName, cn } from "@/lib/utils";
import type { School as SchoolRow } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui";
import {
  AdminEmpty,
  AdminList,
  AdminListRow,
  AdminLoading,
  AdminPageHeader,
  AdminSection,
  AdminStatusDot,
} from "@/components/admin/AdminKit";

const DAY_MS = 24 * 60 * 60 * 1000;

type PendingInvite = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  school_id: string | null;
  expires_at: string;
  created_at: string;
  ecoles: { name: string } | null;
};

type AttentionItem = {
  key: string;
  to: string;
  title: string;
  detail: string;
  tone: "warning" | "danger";
};

export default function AdminDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const refreshing = useIsFetching() > 0;

  const { data: schools = [], isLoading: loadingSchools } = useQuery({
    queryKey: ["ecoles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ecoles").select("*").order("name");
      if (error) throw error;
      return data as SchoolRow[];
    },
  });

  const { data: adminRoles = [] } = useQuery({
    queryKey: ["admin-dashboard-school-admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles_utilisateurs")
        .select("school_id")
        .eq("role", "school_admin")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as { school_id: string | null }[];
    },
  });

  const { data: pendingInvites = [], isLoading: loadingInvites } = useQuery({
    queryKey: ["admin-dashboard-pending-invites"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select(
          "id, email, first_name, last_name, role, school_id, expires_at, created_at, ecoles(name)",
        )
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PendingInvite[];
    },
  });

  const stats = useMemo(() => {
    const now = Date.now();
    const active = schools.filter((s) => s.active);
    const withAdmin = new Set(
      adminRoles.map((r) => r.school_id).filter(Boolean) as string[],
    );
    const withoutAdmin = active.filter((s) => !withAdmin.has(s.id));
    const expiringInvites = pendingInvites.filter(
      (i) => new Date(i.expires_at).getTime() - now < 2 * DAY_MS,
    );
    const pastDue = active.filter((s) => s.billing_status === "past_due");
    const endingSoon = active.filter((s) => {
      if (!s.subscription_ends_at || s.billing_status === "cancelled") return false;
      const left = new Date(s.subscription_ends_at).getTime() - now;
      return left >= 0 && left < 30 * DAY_MS;
    });
    const recent = [...schools]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6);

    const attention: AttentionItem[] = [
      ...pastDue.map((s) => ({
        key: `due-${s.id}`,
        to: "/admin/abonnements",
        title: s.name,
        detail: "Abonnement impayé",
        tone: "danger" as const,
      })),
      ...withoutAdmin.map((s) => ({
        key: `admin-${s.id}`,
        to: `/admin/ecoles/${s.id}`,
        title: s.name,
        detail: "Aucun administrateur actif",
        tone: "warning" as const,
      })),
      ...endingSoon.map((s) => ({
        key: `end-${s.id}`,
        to: "/admin/abonnements",
        title: s.name,
        detail: `Abonnement jusqu’au ${formatDateSafe(s.subscription_ends_at, "d MMMM yyyy", { locale: fr })}`,
        tone: "warning" as const,
      })),
      ...expiringInvites.map((i) => ({
        key: `inv-${i.id}`,
        to: "/admin/invitations",
        title: fullName(i.first_name, i.last_name),
        detail: `Invitation qui expire ${relativeFr(i.expires_at)}`,
        tone: "warning" as const,
      })),
    ];

    return {
      total: schools.length,
      active: active.length,
      inactive: schools.length - active.length,
      adminCount: adminRoles.length,
      withoutAdmin: withoutAdmin.length,
      pending: pendingInvites.length,
      expiring: expiringInvites.length,
      paying: schools.filter((s) => s.billing_status === "active").length,
      trial: schools.filter((s) => (s.billing_status ?? "trial") === "trial").length,
      pastDue: pastDue.length,
      recent,
      attention,
    };
  }, [schools, adminRoles, pendingInvites]);

  const firstName = profile?.first_name?.trim();
  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: fr });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tableau de bord"
        stats={[
          {
            label: "Écoles",
            value: String(stats.total),
            hint: `${stats.active} active${stats.active > 1 ? "s" : ""} · ${stats.inactive} inactive${stats.inactive > 1 ? "s" : ""}`,
            to: "/admin/ecoles",
          },
          {
            label: "Admins d’école",
            value: String(stats.adminCount),
            hint:
              stats.withoutAdmin > 0
                ? `${stats.withoutAdmin} école${stats.withoutAdmin > 1 ? "s" : ""} sans admin`
                : "Chaque école en a un",
            to: "/admin/utilisateurs",
          },
          {
            label: "Invitations",
            value: String(stats.pending),
            hint: stats.expiring > 0 ? `${stats.expiring} expire${stats.expiring > 1 ? "nt" : ""} sous 48 h` : "en attente",
            to: "/admin/invitations",
          },
          {
            label: "Abonnements actifs",
            value: String(stats.paying),
            hint: `${stats.trial} en essai · ${stats.pastDue} impayé${stats.pastDue > 1 ? "s" : ""}`,
            to: "/admin/abonnements",
          },
        ]}
        subtitle={
          <>
            {getTimeGreeting()}
            {firstName ? `, ${firstName}` : ""} · {today}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              
              onClick={() => void qc.invalidateQueries()}
              disabled={refreshing}
              aria-label="Actualiser les données"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Actualiser
            </Button>
            <Button
              size="sm"
              
              onClick={() => navigate("/admin/ecoles")}
            >
              <Plus className="h-4 w-4" />
              Nouvelle école
            </Button>
          </>
        }
      />

      <AdminSection
        title="À traiter"
        icon={ClipboardList}
        count={loadingSchools ? undefined : stats.attention.length}
        linkTo={stats.attention.length > 0 ? "/admin/rapports" : undefined}
        linkLabel="Voir les rapports"
      >
        {loadingSchools ? (
          <AdminLoading />
        ) : stats.attention.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            Rien à traiter pour le moment.
          </p>
        ) : (
          <AdminList>
            {stats.attention.slice(0, 6).map((item) => (
              <AdminListRow
                key={item.key}
                to={item.to}
                primary={
                  <span className="flex items-center gap-2">
                    <AlertTriangle
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        item.tone === "danger" ? "text-red-600" : "text-amber-600",
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{item.title}</span>
                  </span>
                }
                secondary={<span className="pl-[1.375rem]">{item.detail}</span>}
              />
            ))}
          </AdminList>
        )}
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection title="Écoles récentes" icon={Building2} linkTo="/admin/ecoles">
          {loadingSchools ? (
            <AdminLoading />
          ) : stats.recent.length === 0 ? (
            <AdminEmpty message="Aucune école pour le moment." />
          ) : (
            <AdminList>
              {stats.recent.map((s) => (
                <AdminListRow
                  key={s.id}
                  to={`/admin/ecoles/${s.id}`}
                  primary={s.name}
                  secondary={[schoolTypeLabel(s.school_type), s.city, `créée ${relativeFr(s.created_at)}`]
                    .filter((x) => x && x !== "—")
                    .join(" · ")}
                  aside={
                    <AdminStatusDot
                      tone={s.active ? "success" : "danger"}
                      label={s.active ? "Active" : "Inactive"}
                    />
                  }
                />
              ))}
            </AdminList>
          )}
        </AdminSection>

        <AdminSection
          title="Invitations en attente"
          icon={Mail}
          count={loadingInvites ? undefined : stats.pending}
          linkTo="/admin/invitations"
        >
          {loadingInvites ? (
            <AdminLoading />
          ) : pendingInvites.length === 0 ? (
            <AdminEmpty message="Aucune invitation en cours." />
          ) : (
            <AdminList>
              {pendingInvites.slice(0, 6).map((inv) => (
                <AdminListRow
                  key={inv.id}
                  to={inv.school_id ? `/admin/ecoles/${inv.school_id}` : "/admin/super-admins"}
                  primary={fullName(inv.first_name, inv.last_name)}
                  secondary={`${inv.email} · ${
                    inv.role === "super_admin" ? "Super admin" : (inv.ecoles?.name ?? "École")
                  }`}
                  aside={
                    <span className="text-xs text-slate-500">
                      expire {relativeFr(inv.expires_at)}
                    </span>
                  }
                />
              ))}
            </AdminList>
          )}
        </AdminSection>
      </div>

    </div>
  );
}
