import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  NotebookPen,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotesPendingChanges } from "@/hooks/useNotesRealtime";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { useExercicesPendingChanges } from "@/hooks/useExamRealtime";
import { useCompositionsPendingChanges } from "@/hooks/useCompositionRealtime";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { joinProfile } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { Card, EmptyState, PageHeader } from "@/components/ui";

const CHILD_LINKS = [
  { to: "notes", label: "Notes", icon: BookOpen },
  { to: "presences", label: "Présences", icon: UserCheck },
  { to: "bulletin", label: "Bulletin", icon: FileText },
  { to: "emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
  { to: "cahier", label: "Cahier de textes", icon: BookOpenCheck },
  { to: "devoirs", label: "Devoirs", icon: GraduationCap },
  { to: "exercices", label: "Exercices", icon: NotebookPen },
  { to: "compositions", label: "Compositions", icon: ClipboardList },
] as const;

export default function Enfants() {
  const { user } = useAuth();
  const { markSeen: markNotesSeen } = useNotesPendingChanges();
  const { markSeen: markPresenceSeen } = usePresencePendingChanges();
  const { markSeen: markEdtSeen } = useEdtPendingChanges();
  const { markSeen: markExercicesSeen } = useExercicesPendingChanges();
  const { markSeen: markCompositionsSeen } = useCompositionsPendingChanges();

  useEffect(() => {
    markNotesSeen();
    markPresenceSeen();
    markEdtSeen();
    markExercicesSeen();
    markCompositionsSeen();
  }, [
    markNotesSeen,
    markPresenceSeen,
    markEdtSeen,
    markExercicesSeen,
    markCompositionsSeen,
  ]);

  const { data: children = [], isLoading } = useQuery({
    queryKey: ["enfants", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liens_parent_eleve")
        .select("student_id, profils:profils!liens_parent_eleve_student_id_fkey(*)")
        .eq("parent_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
    },
  });

  return (
    <div>
      <PageHeader title="Mes enfants" subtitle="Suivi scolaire" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : children.length === 0 ? (
        <EmptyState message="Aucun enfant lié à votre compte." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => (
            <Card key={child.id}>
              <h3 className="text-lg font-semibold">
                <PersonName first={child.first_name} last={child.last_name} />
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {CHILD_LINKS.map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={`/enfants/${child.id}/${to}`}>
                    <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-brand-300 hover:bg-brand-50 dark:border-slate-600 dark:hover:border-brand-500 dark:hover:bg-brand-950/40">
                      <Icon className="h-4 w-4 text-brand-700" />
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
