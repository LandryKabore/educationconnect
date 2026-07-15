import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear, ClassSection } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function Classes() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [yearId, setYearId] = useState("");

  const { data: years = [] } = useQuery({
    queryKey: ["annees", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("annees_scolaires")
        .select("*")
        .eq("school_id", schoolId!)
        .order("start_date", { ascending: false });
      return (data ?? []) as AcademicYear[];
    },
  });

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, annees_scolaires(label)")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data as (ClassSection & { annees_scolaires: { label: string } })[];
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !yearId) return;
    const { error } = await supabase.from("classes").insert({
      school_id: schoolId,
      academic_year_id: yearId,
      name: name.trim(),
      grade_level: gradeLevel.trim(),
      capacity: capacity ? Number(capacity) : null,
    });
    if (error) {
      toast.error("Erreur lors de la création");
      return;
    }
    toast.success("Classe créée");
    setName("");
    setGradeLevel("");
    setCapacity("");
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["classes", schoolId] });
  };

  return (
    <div>
      <PageHeader
        title="Classes"
        actions={<Button onClick={() => setShowForm(!showForm)}>Nouvelle classe</Button>}
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label>Année scolaire</Label>
              <Select value={yearId} onChange={(e) => setYearId(e.target.value)} required>
                <option value="">Choisir…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Niveau</Label>
              <Input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
            </div>
            <div>
              <Label>Capacité</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
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
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id}>
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-sm text-slate-500">{c.grade_level || "—"}</p>
              <p className="text-xs text-slate-400">{c.annees_scolaires?.label}</p>
              {c.capacity ? (
                <p className="mt-1 text-xs text-slate-500">Capacité : {c.capacity}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
