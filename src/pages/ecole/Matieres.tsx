import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Subject } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

export default function Matieres() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [coefficient, setCoefficient] = useState("1");

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data as Subject[];
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    const { error } = await supabase.from("matieres").insert({
      school_id: schoolId,
      name: name.trim(),
      code: code.trim() || null,
      coefficient: Number(coefficient) || 1,
    });
    if (error) {
      toast.error("Erreur lors de la création");
      return;
    }
    toast.success("Matière créée");
    setName("");
    setCode("");
    setCoefficient("1");
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["matieres", schoolId] });
  };

  return (
    <div>
      <PageHeader
        title="Matières"
        actions={<Button onClick={() => setShowForm(!showForm)}>Nouvelle matière</Button>}
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <Label>Coefficient</Label>
              <Input
                type="number"
                step="0.5"
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Créer</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : subjects.length === 0 ? (
        <EmptyState message="Aucune matière." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Card key={s.id}>
              <h3 className="font-semibold">{s.name}</h3>
              {s.code ? <p className="text-sm text-slate-500">{s.code}</p> : null}
              <p className="text-xs text-slate-400">Coef. {s.coefficient}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
