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
  const [adminEmail, setAdminEmail] = useState("");

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
        .select("*, profils(*)")
        .eq("school_id", id!)
        .eq("role", "school_admin")
        .eq("active", true);
      if (error) throw error;
      return (roles ?? []).map((r) => ({
        ...(r as UserRoleRow),
        profil: (r as { profils: Profile }).profils,
      }));
    },
  });

  const handleAssignAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info(
      "Fonction d'attribution d'administrateur à venir — utilisez la fonction creer-utilisateur avec le rôle school_admin."
    );
    setAdminEmail("");
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
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {fullName(a.profil?.first_name, a.profil?.last_name)}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => void handleAssignAdmin(e)} className="space-y-3">
            <div>
              <Label htmlFor="adminEmail">Attribuer un administrateur</Label>
              <Input
                id="adminEmail"
                placeholder="identifiant ou e-mail"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Attribuer (bientôt)
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
