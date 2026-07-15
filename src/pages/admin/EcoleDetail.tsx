import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile, School, UserRoleRow } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

export default function EcoleDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

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

  const { data: admins = [] } = useQuery({
    queryKey: ["ecole-admins", id],
    enabled: !!id,
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

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !firstName.trim() || !lastName.trim() || !email.trim()) return;

    setCreating(true);
    setInviteUrl(null);

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
        emailSent?: boolean;
        message?: string;
      };

      if (res.error || !res.inviteUrl) {
        throw new Error(res.error ?? "Invitation échouée");
      }

      setInviteUrl(res.inviteUrl);
      toast.success(
        res.emailSent
          ? "E-mail d'invitation envoyé"
          : "Lien créé — partagez-le (e-mail non envoyé)"
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["ecole-admins", id] });
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
    void qc.invalidateQueries({ queryKey: ["ecole-admins", id] });
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

      <PageHeader title={school.name} subtitle={school.city ?? undefined} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Informations</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Code</dt>
              <dd>{school.code ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Adresse</dt>
              <dd>{school.address ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Téléphone</dt>
              <dd>{school.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Statut</dt>
              <dd>
                <Badge tone={school.active ? "success" : "danger"}>
                  {school.active ? "Active" : "Inactive"}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Administrateurs d'école</h2>
          {admins.length === 0 ? (
            <p className="mb-4 text-sm text-slate-500">Aucun administrateur assigné.</p>
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

          <form onSubmit={(e) => void handleInviteAdmin(e)} className="space-y-3">
            <p className="text-sm text-slate-600">
              Invitez un administrateur par e-mail. Il ouvrira un lien sur le site EduFaso
              pour créer son mot de passe.
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
              {creating ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </form>

          {inviteUrl ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Lien d'invitation</p>
              <p className="mt-2 break-all text-xs">{inviteUrl}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void copyLink()}
              >
                <Copy className="h-4 w-4" />
                Copier le lien
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
