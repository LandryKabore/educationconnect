import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { EmptyState } from "@/components/ui";
import { NotesBanner } from "@/pages/eleve/MesNotes";
import { useAuth } from "@/contexts/AuthContext";
import { useNotesPendingChanges } from "@/hooks/useNotesRealtime";
import { ANNUAL_PERIOD_LABEL, programmeToCoefMap, TRIMESTER_PERIODS } from "@/lib/averages";
import { periodTabLabel } from "@/lib/bulletinFormat";
import { useGradingPeriodState } from "@/hooks/useGradingPeriodState";
import type { EvaluationType, GradeRow, Subject } from "@/lib/types";
import { cn, fullName } from "@/lib/utils";

const NOTES_PERIODS = [...TRIMESTER_PERIODS, ANNUAL_PERIOD_LABEL] as const;
import { supabase } from "@/lib/supabase";

export default function EnfantNotes() {
  const { id } = useParams<{ id: string }>();
  const { user, schoolId } = useAuth();
  const { markSeen } = useNotesPendingChanges();

  useEffect(() => {
    if (id) markSeen(id);
  }, [id, markSeen]);

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
        .select("*, matieres(*), evaluations(type, title, eval_date)")
        .eq("student_id", id!)
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

  // opens on the current trimester (the school's open period), like the student page
  const { period, selectPeriod, closedLabels } = useGradingPeriodState(NOTES_PERIODS, {
    classSectionId: enrollment?.class_section_id,
    schoolId,
  });

  if (!link && !isLoading) {
    return <EmptyState message="Accès non autorisé à cet élève." />;
  }

  return (
    <div>
      <NotesBanner
        eyebrow={child ? `Résultats scolaires · ${fullName(child.first_name, child.last_name)}` : "Résultats scolaires"}
        title={child ? `Notes de ${child.first_name}` : "Notes"}
        subtitle="Moyennes calculées avec les coefficients de la classe, comme sur le bulletin."
        grades={grades}
        coefMap={coefMap}
        period={period}
        bulletinHref={`/enfants/${id}/bulletin`}
      />

      <div
        role="tablist"
        aria-label="Période"
        className="sticky top-0 z-20 my-6 flex gap-1 overflow-x-auto rounded-lg border border-brand-200 bg-brand-50/95 p-1 backdrop-blur dark:border-[var(--border)] dark:bg-[var(--surface)]/95"
      >
        {NOTES_PERIODS.map((p) => {
          const active = p === period;
          const count = p === ANNUAL_PERIOD_LABEL ? grades.length : grades.filter((g) => g.period_label === p).length;
          return (
            <button
              key={p}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => selectPeriod(p)}
              className={cn(
                "min-w-16 flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition",
                active
                  ? "bg-brand-700 text-white shadow-sm"
                  : "text-brand-900 hover:bg-white dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
              )}
            >
              {periodTabLabel(p)}
              <span className={cn("ml-1.5 text-xs font-medium", active ? "text-white/80" : "text-slate-500")}>
                · {count} note{count > 1 ? "s" : ""}
              </span>
              {closedLabels.has(p) ? <span className="ml-1 text-xs font-medium opacity-75">(clôturé)</span> : null}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : grades.length === 0 ? (
        <EmptyState message="Aucune note disponible." />
      ) : (
        <NotesPeriodTables
          grades={grades}
          coefficientBySubject={coefMap}
          showEvaluation
          periodFilter={period}
        />
      )}
    </div>
  );
}
