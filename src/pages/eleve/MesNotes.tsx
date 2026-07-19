import { useQuery } from "@tanstack/react-query";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { EmptyState, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { programmeToCoefMap } from "@/lib/averages";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export default function MesNotes() {
  const { user } = useAuth();

  const { data: enrollment } = useQuery({
    queryKey: ["mon-inscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as { class_section_id: string } | null;
    },
  });

  const { data: coefMap = {} } = useQuery({
    queryKey: ["programme-coefs", enrollment?.class_section_id],
    enabled: !!enrollment?.class_section_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", enrollment!.class_section_id);
      return programmeToCoefMap(data ?? []);
    },
  });

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ["mes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*), evaluations(type, title)")
        .eq("student_id", user!.id)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & {
        matieres: Subject;
        evaluations: { type: EvaluationType; title: string } | null;
      })[];
    },
  });

  return (
    <div>
      <PageHeader title="Mes notes" subtitle="Résultats scolaires" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note publiée pour le moment." />
      ) : (
        <NotesPeriodTables
          grades={grades}
          coefficientBySubject={coefMap}
          showEvaluation
        />
      )}
    </div>
  );
}
