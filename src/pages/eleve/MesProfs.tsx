import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fullName, joinProfile } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

type AssignmentRow = {
  id: string;
  teacher_id: string;
  subject_id: string;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

type TeacherCard = {
  teacherId: string;
  firstName: string;
  lastName: string;
  subjects: string[];
};

export default function MesProfs() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["mes-profs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment, error: enrError } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (enrError) throw enrError;
      if (!enrollment) {
        return { className: null as string | null, teachers: [] as TeacherCard[] };
      }

      const row = enrollment as {
        class_section_id: string;
        classes: unknown;
      };
      const className =
        joinProfile<{ name: string }>(row.classes)?.name ?? null;

      const { data: assignments, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "id, teacher_id, subject_id, matieres(name), profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)",
        )
        .eq("class_section_id", row.class_section_id);
      if (error) throw error;

      const byTeacher = new Map<string, TeacherCard>();
      for (const raw of assignments ?? []) {
        const a = raw as unknown as AssignmentRow;
        const profile = joinProfile(a.profils);
        const existing = byTeacher.get(a.teacher_id);
        const subject = a.matieres?.name?.trim();
        if (existing) {
          if (subject && !existing.subjects.includes(subject)) {
            existing.subjects.push(subject);
          }
          continue;
        }
        byTeacher.set(a.teacher_id, {
          teacherId: a.teacher_id,
          firstName: profile?.first_name ?? "",
          lastName: profile?.last_name ?? "",
          subjects: subject ? [subject] : [],
        });
      }

      const teachers = [...byTeacher.values()].sort((a, b) =>
        fullName(a.firstName, a.lastName).localeCompare(
          fullName(b.firstName, b.lastName),
          "fr",
        ),
      );
      for (const t of teachers) {
        t.subjects.sort((x, y) => x.localeCompare(y, "fr"));
      }

      return { className, teachers };
    },
  });

  const teachers = data?.teachers ?? [];
  const className = data?.className;

  const subtitle = useMemo(() => {
    if (className) return `Enseignants de ${className}`;
    return "Enseignants de votre classe";
  }, [className]);

  return (
    <div>
      <PageHeader title="Mes profs" subtitle={subtitle} />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : !className ? (
        <EmptyState message="Vous n’êtes inscrit dans aucune classe pour le moment." />
      ) : teachers.length === 0 ? (
        <EmptyState message="Aucun enseignant n’est encore affecté à votre classe." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((t) => (
            <Card key={t.teacherId} className="h-full">
              <div className="flex h-full flex-col gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    <PersonName first={t.firstName} last={t.lastName} />
                  </h3>
                  {t.subjects.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {t.subjects.map((s) => (
                        <li
                          key={s}
                          className="text-sm text-slate-600 dark:text-slate-300"
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Matière non précisée</p>
                  )}
                </div>
                <div className="mt-auto">
                  <Link
                    to={`/messages?avec=${encodeURIComponent(t.teacherId)}&retour=${encodeURIComponent("/mes-profs")}`}
                    className="block"
                  >
                    <Button type="button" size="sm" variant="outline" className="w-full">
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
