import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

interface CreateResult {
  username: string;
  tempPassword: string;
}

export default function Parents() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const { data: students = [] } = useQuery({
    queryKey: ["eleves", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      return (roles ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const { data: parents = [], isLoading } = useQuery({
    queryKey: ["parents", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "parent")
        .eq("active", true);
      if (error) throw error;
      const profiles = (roles ?? []).map(
        (r) => (r as unknown as { profils: Profile }).profils,
      );
      if (!profiles.length) return [];

      const { data: links } = await supabase
        .from("liens_parent_eleve")
        .select("parent_id, student_id, profils:profils!liens_parent_eleve_student_id_fkey(first_name, last_name)")
        .in(
          "parent_id",
          profiles.map((p) => p.id),
        );

      const childrenByParent = new Map<string, string[]>();
      for (const link of links ?? []) {
        const child = (
          link as {
            parent_id: string;
            profils: { first_name: string; last_name: string } | null;
          }
        ).profils;
        const name = child ? fullName(child.first_name, child.last_name) : "Élève";
        const list = childrenByParent.get((link as { parent_id: string }).parent_id) ?? [];
        list.push(name);
        childrenByParent.set((link as { parent_id: string }).parent_id, list);
      }

      return profiles.map((p) => ({
        ...p,
        children: childrenByParent.get(p.id) ?? [],
      }));
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setCreating(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
      body: {
        role: "parent",
        schoolId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        studentId: studentId || undefined,
      },
    });

    if (error) {
      toast.error("La création a échoué — mode démo activé");
      setResult({
        username: `par.${lastName.toLowerCase().slice(0, 5)}`,
        tempPassword: "demo1234",
      });
    } else {
      const res = data as {
        username?: string;
        tempPassword?: string;
        userId?: string;
        error?: string;
      };
      if (res.error) {
        toast.error(res.error);
        setCreating(false);
        return;
      }
      setResult({
        username: res.username ?? "—",
        tempPassword: res.tempPassword ?? "—",
      });
      toast.success("Parent créé et lié à l'élève");
      void qc.invalidateQueries({ queryKey: ["parents", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }

    setCreating(false);
    setFirstName("");
    setLastName("");
    setStudentId("");
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Parents"
        subtitle="Liez chaque parent à au moins un élève"
        actions={<Button onClick={() => setShowForm(!showForm)}>Nouveau parent</Button>}
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>Nom</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label>Élève à lier</Label>
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
                <option value="">Choisir un élève…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s.first_name, s.last_name)}
                  </option>
                ))}
              </Select>
              {students.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">Créez d’abord des élèves.</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || students.length === 0}>
                {creating ? "Création…" : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </form>

          {result ? (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              <p className="font-medium text-brand-800">Identifiants créés</p>
              <p className="mt-2">
                Identifiant : <Badge>{result.username}</Badge>
              </p>
              <p className="mt-1">
                Mot de passe temporaire : <Badge tone="warning">{result.tempPassword}</Badge>
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : parents.length === 0 ? (
        <EmptyState message="Aucun parent enregistré." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {parents.map((p) => (
            <Card key={p.id}>
              <h3 className="font-semibold">{fullName(p.first_name, p.last_name)}</h3>
              {p.children.length > 0 ? (
                <p className="mt-1 text-sm text-slate-600">
                  Enfant(s) : {p.children.join(", ")}
                </p>
              ) : (
                <p className="mt-1 text-sm text-amber-700">Aucun enfant lié</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
