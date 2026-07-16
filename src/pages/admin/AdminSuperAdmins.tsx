import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plus, UserCog } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Profile, UserRoleRow } from "@/lib/types";
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

type SuperAdminRow = UserRoleRow & { profil: Profile | null };

export default function AdminSuperAdmins() {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  const { data: superAdmins = [], isLoading } = useQuery({
    queryKey: ["admin-super-admins"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("*")
        .eq("role", "super_admin")
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

      const byId = new Map(((profils ?? []) as Profile[]).map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        profil: byId.get(r.user_id) ?? null,
      })) as SuperAdminRow[];
    },
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

    setInviting(true);
    setEmailMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke("inviter-admin", {
        body: {
          role: "super_admin",
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
        },
      });
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
          ? "Invitation envoyée par e-mail"
          : "Invitation créée — copiez le message",
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["admin-super-admins"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invitation impossible");
    } finally {
      setInviting(false);
    }
  };

  const copyMessage = async () => {
    if (!emailMessage) return;
    await navigator.clipboard.writeText(emailMessage);
    toast.success("Message copié");
  };

  return (
    <div>
      <PageHeader
        title="Super administrateurs"
        subtitle="Comptes avec accès à la plateforme EduFaso"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <UserCog className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold">Comptes actifs ({superAdmins.length})</h2>
          </div>
          {isLoading ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : superAdmins.length === 0 ? (
            <EmptyState message="Aucun super administrateur actif." />
          ) : (
            <ul className="space-y-2">
              {superAdmins.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">
                      {fullName(row.profil?.first_name, row.profil?.last_name)}
                    </span>
                    {row.profil?.email ? (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {row.profil.email}
                      </span>
                    ) : null}
                  </span>
                  <Badge tone={row.profil?.active ? "success" : "danger"}>
                    {row.profil?.active ? "Actif" : "Inactif"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand-700" />
            <h2 className="font-semibold">Inviter un super administrateur</h2>
          </div>
          <form onSubmit={(e) => void handleInvite(e)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="saFirst">Prénom</Label>
                <Input
                  id="saFirst"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="saLast">Nom</Label>
                <Input
                  id="saLast"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="saEmail">E-mail</Label>
              <Input
                id="saEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={inviting}>
              {inviting ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </form>

          {emailMessage ? (
            <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-semibold text-emerald-950">Message d'invitation</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-xs text-slate-800">
                {emailMessage}
              </pre>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyMessage()}>
                <Copy className="h-4 w-4" />
                Copier le message
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
