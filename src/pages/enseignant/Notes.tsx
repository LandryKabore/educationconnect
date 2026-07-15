import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Profile, Subject } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function Notes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState("Trimestre 1");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: subjects = [] } = useQuery({
    queryKey: ["class-subjects", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("matieres(*)")
        .eq("class_section_id", id!);
      const unique = new Map<string, Subject>();
      for (const row of data ?? []) {
        const sub = (row as unknown as { matieres: Subject }).matieres;
        if (sub) unique.set(sub.id, sub);
      }
      return [...unique.values()];
    },
  });

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["class-roster", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("profils(*)")
        .eq("class_section_id", id!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const handleSave = async () => {
    if (!id || !user || !subjectId) {
      toast.error("Sélectionnez une matière");
      return;
    }
    setSaving(true);
    for (const student of students) {
      const raw = scores[student.id];
      if (!raw) continue;
      const score = Number(raw);
      if (Number.isNaN(score)) continue;
      await supabase.from("notes").insert({
        student_id: student.id,
        subject_id: subjectId,
        class_section_id: id,
        period_label: period,
        score,
        max_score: 20,
        recorded_by: user.id,
      });
    }
    toast.success("Notes enregistrées");
    setScores({});
    void qc.invalidateQueries({ queryKey: ["notes"] });
    setSaving(false);
  };

  return (
    <div>
      <Link
        to={`/classes/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la classe
      </Link>

      <PageHeader
        title="Notes"
        actions={
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        }
      />

      <div className="mb-6 grid max-w-lg gap-4 sm:grid-cols-2">
        <div>
          <Label>Matière</Label>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Choisir…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Période</Label>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="Trimestre 1">Trimestre 1</option>
            <option value="Trimestre 2">Trimestre 2</option>
            <option value="Trimestre 3">Trimestre 3</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève dans cette classe." />
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="font-medium">{fullName(s.first_name, s.last_name)}</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  placeholder="/20"
                  className="w-24"
                  value={scores[s.id] ?? ""}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [s.id]: e.target.value }))
                  }
                />
                <span className="text-sm text-slate-500">/ 20</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
