import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Mail, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, type AppRole, type InvitationRow } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
} from "@/components/ui";

type InviteWithSchool = InvitationRow & {
  ecoles?: { name?: string } | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminInvites() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ["admin-invites-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*, ecoles(name)")
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteWithSchool[];
    },
  });

  const { data: accepted = [], isLoading: loadingAccepted } = useQuery({
    queryKey: ["admin-invites-accepted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*, ecoles(name)")
        .not("accepted_at", "is", null)
        .is("cancelled_at", null)
        .order("accepted_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as InviteWithSchool[];
    },
  });

  const filterInvites = (list: InviteWithSchool[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((inv) => {
      const name = fullName(inv.first_name, inv.last_name).toLowerCase();
      const school = inv.ecoles?.name?.toLowerCase() ?? "";
      return (
        name.includes(q) ||
        inv.email.toLowerCase().includes(q) ||
        school.includes(q)
      );
    });
  };

  const pendingFiltered = useMemo(() => filterInvites(pending), [pending, search]);
  const acceptedFiltered = useMemo(() => filterInvites(accepted), [accepted, search]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-invites-pending"] });
    void qc.invalidateQueries({ queryKey: ["admin-invites-accepted"] });
  };

  const cancelInvite = async (inviteId: string) => {
    setBusyId(inviteId);
    try {
      const { data, error } = await supabase.functions.invoke("support-user-action", {
        body: { action: "cancel_invite", inviteId },
      });
      if (error) throw error;
      const res = data as { error?: string };
      if (res.error) throw new Error(res.error);
      toast.success("Invitation annulée");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Annulation impossible");
    } finally {
      setBusyId(null);
    }
  };

  const resendInvite = async (inv: InviteWithSchool) => {
    setBusyId(inv.id);
    setEmailMessage(null);
    try {
      const body: Record<string, string> = {
        email: inv.email,
        firstName: inv.first_name,
        lastName: inv.last_name,
        role: inv.role,
      };
      if (inv.school_id) body.schoolId = inv.school_id;

      const { data, error } = await supabase.functions.invoke("inviter-admin", { body });
      if (error) throw error;

      const res = data as {
        error?: string;
        emailMessage?: string;
        emailSent?: boolean;
      };
      if (res.error) throw new Error(res.error);

      setEmailMessage(res.emailMessage ?? null);
      toast.success(
        res.emailSent
          ? "Invitation renvoyée par e-mail"
          : "Invitation recréée — copiez le message",
      );
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Renvoi impossible");
    } finally {
      setBusyId(null);
    }
  };

  const copyMessage = async () => {
    if (!emailMessage) return;
    await navigator.clipboard.writeText(emailMessage);
    toast.success("Message copié");
  };

  const renderInvite = (inv: InviteWithSchool, pendingRow: boolean) => {
    const schoolName = inv.ecoles?.name ?? (inv.role === "super_admin" ? "Plateforme" : "—");
    const busy = busyId === inv.id;

    return (
      <li
        key={inv.id}
        className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="font-medium">{fullName(inv.first_name, inv.last_name)}</p>
          <p className="text-xs text-slate-600">{inv.email}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="info">{ROLE_LABELS[inv.role as AppRole] ?? inv.role}</Badge>
            <Badge tone={pendingRow ? "warning" : "success"}>
              {pendingRow ? "En attente" : "Acceptée"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {schoolName}
            {pendingRow
              ? ` · Expire le ${formatDate(inv.expires_at)}`
              : inv.accepted_at
                ? ` · Acceptée le ${formatDate(inv.accepted_at)}`
                : ""}
          </p>
          {inv.school_id ? (
            <Link
              to={`/admin/ecoles/${inv.school_id}`}
              className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
            >
              Voir l'école
            </Link>
          ) : null}
        </div>
        {pendingRow ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void resendInvite(inv)}
            >
              <Mail className="h-4 w-4" />
              Renvoyer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void cancelInvite(inv.id)}
            >
              <XCircle className="h-4 w-4" />
              Annuler
            </Button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        title="Invitations"
        subtitle="Invitations en attente et récemment acceptées"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Rechercher par nom, e-mail ou école…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {emailMessage ? (
        <Card className="mb-4 border-emerald-200 bg-emerald-50">
          <p className="mb-2 text-sm font-semibold text-emerald-950">Message d'invitation</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-xs text-slate-800">
            {emailMessage}
          </pre>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void copyMessage()}>
            <Copy className="h-4 w-4" />
            Copier le message
          </Button>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">En attente ({pendingFiltered.length})</h2>
          {loadingPending ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : pendingFiltered.length === 0 ? (
            <EmptyState message="Aucune invitation en attente." />
          ) : (
            <ul className="space-y-2">{pendingFiltered.map((inv) => renderInvite(inv, true))}</ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Récemment acceptées ({acceptedFiltered.length})</h2>
          {loadingAccepted ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : acceptedFiltered.length === 0 ? (
            <EmptyState message="Aucune invitation acceptée récemment." />
          ) : (
            <ul className="space-y-2">{acceptedFiltered.map((inv) => renderInvite(inv, false))}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
