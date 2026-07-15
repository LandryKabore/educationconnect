import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile } from "@/lib/types";
import { fullName } from "@/lib/utils";
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

export default function Eleves() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classId, setClassId] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as ClassSection[];
    },
  });

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["eleves", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      if (error) throw error;
      return (roles ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setCreating(true);
    setResult(null);

    const body: Record<string, string> = {
      role: "student",
      schoolId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };
    if (classId) body.classId = classId;

    const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
      body,
    });

    if (error) {
      toast.error("La création a échoué — mode démo activé");
      const demoUser = `${firstName.toLowerCase().slice(0, 3)}.${lastName.toLowerCase().slice(0, 3)}`;
      setResult({
        username: demoUser,
        tempPassword: "demo1234",
      });
      toast.message("Identifiants de démonstration générés localement");
    } else {
      const res = data as { username?: string; tempPassword?: string };
      setResult({
        username: res.username ?? "—",
        tempPassword: res.tempPassword ?? "—",
      });
      toast.success("Élève créé");
      void qc.invalidateQueries({ queryKey: ["eleves", schoolId] });
    }

    setCreating(false);
    setFirstName("");
    setLastName("");
    setClassId("");
  };

  return (
    <div>
      <PageHeader
        title="Élèves"
        actions={<Button onClick={() => setShowForm(!showForm)}>Nouvel élève</Button>}
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
              <Label>Classe (optionnel)</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Aucune</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating}>
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
              <p className="mt-2 text-xs text-slate-500">
                Communiquez ces identifiants à l'élève pour sa première connexion.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève inscrit." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <Card key={s.id}>
              <h3 className="font-semibold">{fullName(s.first_name, s.last_name)}</h3>
              {s.phone ? <p className="text-sm text-slate-500">{s.phone}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
