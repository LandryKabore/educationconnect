import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<{ username: string; tempPassword: string } | null>(
    null
  );

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

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !firstName.trim() || !lastName.trim()) return;

    setCreating(true);
    setCreds(null);

    try {
      const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
        body: {
          role: "school_admin",
          schoolId: id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      });

      if (error) throw error;

      const res = data as {
        success?: boolean;
        error?: string;
        username?: string;
        tempPassword?: string;
      };

      if (res.error || !res.username) {
        throw new Error(res.error ?? "Création échouée");
      }

      setCreds({
        username: res.username,
        tempPassword: res.tempPassword ?? "—",
      });
      toast.success("Administrateur d'école créé");
      setFirstName("");
      setLastName("");
      void qc.invalidateQueries({ queryKey: ["ecole-admins", id] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impossible de créer l'administrateur"
      );
    } finally {
      setCreating(false);
    }
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
                        {a.profil.email.replace("@edufaso.local", "")}
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

          <form onSubmit={(e) => void handleCreateAdmin(e)} className="space-y-3">
            <p className="text-sm text-slate-600">
              Créer un compte administrateur pour cette école. Notez bien les identifiants
              temporaires affichés ensuite.
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
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? "Création…" : "Créer l'administrateur"}
            </Button>
          </form>

          {creds ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">Identifiants (à donner une seule fois)</p>
              <p className="mt-2">
                Identifiant : <code className="font-mono">{creds.username}</code>
              </p>
              <p>
                Mot de passe : <code className="font-mono">{creds.tempPassword}</code>
              </p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
