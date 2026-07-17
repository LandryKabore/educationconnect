import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Pencil, RefreshCw } from "lucide-react";
import { WEBSITE_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import type { Profile, School, UserRoleRow } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  formToSchoolPayload,
  isSchoolFormComplete,
  schoolToForm,
  schoolTypeLabel,
  type SchoolFormFields,
} from "@/lib/schoolForm";
import { SchoolFieldsForm } from "@/components/SchoolFieldsForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

type PendingInvite = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  token: string;
  expires_at: string;
  created_at: string;
};

const INVITE_SITE = (WEBSITE_URL || "https://edufaso.lovable.app").replace(
  /\/$/,
  "",
);

function inviteLinkFor(token: string) {
  return `${INVITE_SITE}/invitation?token=${token}`;
}

export default function EcoleDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<SchoolFormFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const { data: school, isLoading } = useQuery({
    queryKey: ["ecole", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ecoles")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as School;
    },
  });

  useEffect(() => {
    if (!school) return;
    setEditForm(schoolToForm(school));
    // Only re-sync form when the loaded school identity/data version changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id, school?.updated_at ?? school?.created_at]);

  const { data: admins = [] } = useQuery({
    queryKey: ["ecole-admins", id],
    enabled: !!id,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("id, user_id, role, school_id, active")
        .eq("school_id", id!)
        .eq("role", "school_admin")
        .eq("active", true);
      if (error) throw error;

      const rows = (roles ?? []) as UserRoleRow[];
      if (rows.length === 0) return [];

      const userIds = rows.map((r) => r.user_id);
      const { data: profils, error: pErr } = await supabase
        .from("profils")
        .select("*")
        .in("id", userIds);
      if (pErr) throw pErr;

      const byId = new Map((profils as Profile[]).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        profil: byId.get(r.user_id) ?? null,
      }));
    },
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["ecole-invites", id],
    enabled: !!id,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, first_name, last_name, token, expires_at, created_at")
        .eq("school_id", id!)
        .eq("role", "school_admin")
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingInvite[];
    },
  });

  const copyPendingLink = async (token: string) => {
    await navigator.clipboard.writeText(inviteLinkFor(token));
    toast.success("Lien d'invitation copié — envoyez-le à la personne");
  };

  const resendPendingInvite = async (inv: PendingInvite) => {
    if (!id) return;
    setResendingId(inv.id);
    setInviteUrl(null);
    setEmailMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke("inviter-admin", {
        body: {
          role: "school_admin",
          schoolId: id,
          firstName: inv.first_name,
          lastName: inv.last_name,
          email: inv.email,
        },
      });
      if (error) throw error;
      const res = data as {
        error?: string;
        inviteUrl?: string;
        emailMessage?: string;
        emailSent?: boolean;
      };
      if (res.error) throw new Error(res.error);
      setInviteUrl(res.inviteUrl ?? null);
      setEmailMessage(res.emailMessage ?? null);
      toast.success(
        res.emailSent
          ? "Invitation renvoyée par e-mail"
          : "Invitation recréée — copiez le lien",
      );
      refreshLists();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Renvoi impossible");
    } finally {
      setResendingId(null);
    }
  };

  const refreshLists = () => {
    void qc.invalidateQueries({ queryKey: ["ecole-admins", id] });
    void qc.invalidateQueries({ queryKey: ["ecole-invites", id] });
  };

  const setEditField = (key: keyof SchoolFormFields, value: string) => {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !editForm || !isSchoolFormComplete(editForm)) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("ecoles")
      .update(formToSchoolPayload(editForm))
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Ce code d'école existe déjà"
          : "Impossible d'enregistrer"
      );
      return;
    }
    toast.success("Informations mises à jour");
    setEditing(false);
    void qc.invalidateQueries({ queryKey: ["ecole", id] });
    void qc.invalidateQueries({ queryKey: ["ecoles"] });
  };

  const handleToggleActive = async () => {
    if (!id || !school) return;
    setToggling(true);
    const { error } = await supabase
      .from("ecoles")
      .update({ active: !school.active })
      .eq("id", id);
    setToggling(false);
    if (error) {
      toast.error("Impossible de changer le statut");
      return;
    }
    toast.success(school.active ? "École désactivée" : "École réactivée");
    void qc.invalidateQueries({ queryKey: ["ecole", id] });
    void qc.invalidateQueries({ queryKey: ["ecoles"] });
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !firstName.trim() || !lastName.trim() || !email.trim()) return;

    setCreating(true);
    setInviteUrl(null);
    setEmailMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke("inviter-admin", {
        body: {
          role: "school_admin",
          schoolId: id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
        },
      });

      if (error) throw error;

      const res = data as {
        success?: boolean;
        error?: string;
        inviteUrl?: string;
        emailMessage?: string;
        emailSent?: boolean;
      };

      if (res.error || !res.inviteUrl) {
        throw new Error(res.error ?? "Invitation échouée");
      }

      setInviteUrl(res.inviteUrl);
      setEmailMessage(res.emailMessage ?? null);
      toast.success(
        res.emailSent
          ? "Invitation envoyée par e-mail"
          : "Invitation créée — e-mail non envoyé, copiez le lien pour le partager",
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      refreshLists();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impossible d'envoyer l'invitation"
      );
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Lien copié");
  };

  const copyMessage = async () => {
    if (!emailMessage) return;
    await navigator.clipboard.writeText(emailMessage);
    toast.success("Message d'invitation copié");
  };

  const handleRevoke = async (roleId: string) => {
    const { error } = await supabase
      .from("roles_utilisateurs")
      .update({ active: false })
      .eq("id", roleId);
    if (error) {
      toast.error("Impossible de retirer cet administrateur");
      return;
    }
    toast.success("Administrateur retiré");
    refreshLists();
  };

  if (isLoading) return <p className="text-slate-500">Chargement…</p>;
  if (!school) return <EmptyState message="École introuvable." />;

  return (
    <div>
      <Link
        to="/admin/ecoles"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux écoles
      </Link>

      <PageHeader
        title={school.name}
        subtitle={[school.city, school.region].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditForm(schoolToForm(school));
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
            <Button
              type="button"
              variant={school.active ? "danger" : "primary"}
              size="sm"
              disabled={toggling}
              onClick={() => void handleToggleActive()}
            >
              {toggling
                ? "…"
                : school.active
                  ? "Désactiver"
                  : "Réactiver"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Informations</h2>
          {editing && editForm ? (
            <form onSubmit={(e) => void handleSaveSchool(e)} className="space-y-4">
              <SchoolFieldsForm
                form={editForm}
                onChange={setEditField}
                idPrefix="edit"
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setEditForm(schoolToForm(school));
                  }}
                >
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Code</dt>
                <dd className="text-right">{school.code ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Type</dt>
                <dd className="text-right">{schoolTypeLabel(school.school_type)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Région</dt>
                <dd className="text-right">{school.region ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Ville</dt>
                <dd className="text-right">{school.city ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Adresse</dt>
                <dd className="text-right">{school.address ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Téléphone</dt>
                <dd className="text-right">{school.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">E-mail</dt>
                <dd className="text-right">{school.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Statut</dt>
                <dd>
                  <Badge tone={school.active ? "success" : "danger"}>
                    {school.active ? "Active" : "Inactive"}
                  </Badge>
                </dd>
              </div>
            </dl>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Administrateurs d'école</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={refreshLists}
              title="Actualiser"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {admins.length === 0 ? (
            <p className="mb-4 text-sm text-slate-500">
              Aucun administrateur actif pour le moment.
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {admins.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>
                    {fullName(a.profil?.first_name, a.profil?.last_name)}
                    {a.profil?.email ? (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {a.profil.email}
                      </span>
                    ) : null}
                    <span className="mt-1 inline-block">
                      <Badge tone="success">Actif</Badge>
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleRevoke(a.id)}
                  >
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {pendingInvites.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-slate-700">
                Invitations en attente
              </p>
              <ul className="space-y-2">
                {pendingInvites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {fullName(inv.first_name, inv.last_name)}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {inv.email}
                      </span>
                      <span className="mt-1 inline-block">
                        <Badge tone="warning">En attente d'acceptation</Badge>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendingId === inv.id}
                        onClick={() => void resendPendingInvite(inv)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        {resendingId === inv.id ? "Envoi…" : "Renvoyer"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copyPendingLink(inv.token)}
                      >
                        <Copy className="h-4 w-4" />
                        Copier le lien
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={(e) => void handleInviteAdmin(e)} className="space-y-3">
            <p className="text-sm text-slate-600">
              Un e-mail d’invitation est envoyé. Vous pouvez aussi copier le
              lien si besoin (WhatsApp, etc.).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="adminFirst">Prénom</Label>
                <Input
                  id="adminFirst"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="adminLast">Nom</Label>
                <Input
                  id="adminLast"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="adminEmail">E-mail</Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="ex. directeur@ecole.bf"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Envoi…" : "Inviter un administrateur"}
            </Button>
          </form>

          {inviteUrl ? (
            <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <div>
                <p className="font-semibold">Message d'invitation EduFaso</p>
                {emailMessage ? (
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-xs text-slate-800">
                    {emailMessage}
                  </pre>
                ) : (
                  <p className="mt-2 break-all text-xs">{inviteUrl}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {emailMessage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyMessage()}
                  >
                    <Copy className="h-4 w-4" />
                    Copier le message
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyLink()}
                >
                  <Copy className="h-4 w-4" />
                  Copier le lien seul
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
