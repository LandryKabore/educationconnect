import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { EmptyState, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { programmeToCoefMap } from "@/lib/averages";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export default function EnfantNotes() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: link } = useQuery({
    queryKey: ["parent-link", user?.id, id],
    enabled: !!user?.id && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("liens_parent_eleve")
        .select("*, profils:profils!liens_parent_eleve_student_id_fkey(*)")
        .eq("parent_id", user!.id)
        .eq("student_id", id!)
        .maybeSingle();
      return data;
    },
  });

  const child = (
    link as { profils?: { first_name: string; last_name: string } } | null
  )?.profils;

  const { data: enrollment } = useQuery({
    queryKey: ["enfant-inscription", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", id!)
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
    queryKey: ["enfant-notes", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*), evaluations(type, title)")
        .eq("student_id", id!)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & {
        matieres: Subject;
        evaluations: { type: EvaluationType; title: string } | null;
      })[];
    },
  });

  if (!link && !isLoading) {
    return <EmptyState message="Accès non autorisé à cet élève." />;
  }

  return (
    <div>
      <Link
        to="/enfants"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux enfants
      </Link>

      <PageHeader
        title={
          child
            ? `Notes — ${fullName(child.first_name, child.last_name)}`
            : "Notes"
        }
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note disponible." />
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
