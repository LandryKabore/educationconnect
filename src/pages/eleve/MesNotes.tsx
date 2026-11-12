import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { NotesNative } from "@/components/NotesNative";
import { QueryError } from "@/components/QueryError";
import { ScreenSkeleton } from "@/components/Skeleton";
import { EmptyState, PageHeader } from "@/components/ui";
import { isNativeApp } from "@/lib/platform";
import { useAuth } from "@/contexts/AuthContext";
import { useNotesPendingChanges } from "@/hooks/useNotesRealtime";
import { programmeToCoefMap } from "@/lib/averages";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export default function MesNotes() {
  const { user } = useAuth();
  const { markSeen } = useNotesPendingChanges();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

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

  const {
    data: grades = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["mes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*), evaluations(type, title, eval_date)")
        .eq("student_id", user!.id)
        .order("period_label");
      if (error) throw error;
      return data as (GradeRow & {
        matieres: Subject;
        evaluations: {
          type: EvaluationType;
          title: string;
          eval_date: string | null;
        } | null;
      })[];
    },
  });

  const native = isNativeApp();

  return (
    <div>
      {/* the Android top bar already shows the page title */}
      {native ? null : <PageHeader title="Mes notes" subtitle="Résultats scolaires" />}

      {isLoading ? (
        native ? (
          <ScreenSkeleton variant="cards" label="Chargement des notes…" />
        ) : (
          <p className="text-slate-500">Chargement…</p>
        )
      ) : isError ? (
        <QueryError message="Impossible de charger vos notes." onRetry={() => void refetch()} />
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note publiée pour le moment." />
      ) : native ? (
        <NotesNative grades={grades} coefficientBySubject={coefMap} />
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
