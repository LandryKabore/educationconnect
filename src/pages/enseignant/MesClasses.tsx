import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, ClipboardCheck, Users } from "lucide-react";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatAverage, scoreOn20 } from "@/lib/averages";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type SubjectAvg = {
  subjectId: string;
  subjectName: string;
  /** Class average on /20 for this subject, or null if no grades yet. */
  averageOn20: number | null;
  gradeCount: number;
};

type TeacherClass = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  subjects: SubjectAvg[];
  studentCount: number;
};

function scoreBarWidth(on20: number | null): string {
  if (on20 === null) return "0%";
  return `${Math.min(100, Math.max(0, (on20 / 20) * 100))}%`;
}

export default function MesClasses() {
  const { user } = useAuth();

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["teacher-mes-classes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "class_section_id, subject_id, classes(id, name, grade_level), matieres(id, name)",
        )
        .eq("teacher_id", user!.id);
      if (error) throw error;

      const byClass = new Map<
        string,
        {
          classId: string;
          className: string;
          gradeLevel: string | null;
          subjects: Map<string, string>;
        }
      >();

      for (const row of aff ?? []) {
        const r = row as {
          class_section_id: string;
          subject_id: string;
          classes: {
            id: string;
            name: string;
            grade_level: string | null;
          } | null;
          matieres: { id: string; name: string } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        const subjectId = r.matieres?.id ?? r.subject_id;
        const subjectName = r.matieres?.name ?? "Matière";
        const existing = byClass.get(classId);
        if (existing) {
          existing.subjects.set(subjectId, subjectName);
        } else {
          byClass.set(classId, {
            classId,
            className: r.classes?.name ?? "Classe",
            gradeLevel: r.classes?.grade_level ?? null,
            subjects: new Map([[subjectId, subjectName]]),
          });
        }
      }

      const list = [...byClass.values()];

      const sorted = sortClassesByProgression(
        list.map((c) => ({
          id: c.classId,
          name: c.className,
          grade_level: c.gradeLevel,
        })),
      );

      const ordered = sorted
        .map((s) => list.find((c) => c.classId === s.id)!)
        .filter(Boolean);

      const classIds = ordered.map((c) => c.classId);
      const subjectIds = [
        ...new Set(ordered.flatMap((c) => [...c.subjects.keys()])),
      ];

      const counts = new Map<string, number>();
      if (classIds.length > 0) {
        const { data: insc } = await supabase
          .from("inscriptions")
          .select("class_section_id")
          .in("class_section_id", classIds)
          .eq("status", "active");
        for (const row of insc ?? []) {
          const id = (row as { class_section_id: string }).class_section_id;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }

      const scoresByKey = new Map<string, number[]>();
      if (classIds.length > 0 && subjectIds.length > 0) {
        const { data: notes } = await supabase
          .from("notes")
          .select("class_section_id, subject_id, score, max_score, is_absent")
          .in("class_section_id", classIds)
          .in("subject_id", subjectIds);
        for (const n of notes ?? []) {
          const row = n as {
            class_section_id: string;
            subject_id: string;
            score: number;
            max_score: number;
            is_absent: boolean | null;
          };
          if (row.is_absent) continue;
          const key = `${row.class_section_id}|${row.subject_id}`;
          const on20 = scoreOn20(Number(row.score), Number(row.max_score));
          const listScores = scoresByKey.get(key) ?? [];
          listScores.push(on20);
          scoresByKey.set(key, listScores);
        }
      }

      return ordered.map((c): TeacherClass => {
        const subjects: SubjectAvg[] = [...c.subjects.entries()]
          .map(([subjectId, subjectName]) => {
            const scores = scoresByKey.get(`${c.classId}|${subjectId}`) ?? [];
            const averageOn20 =
              scores.length > 0
                ? scores.reduce((a, b) => a + b, 0) / scores.length
                : null;
            return {
              subjectId,
              subjectName,
              averageOn20,
              gradeCount: scores.length,
            };
          })
          .sort((a, b) =>
            a.subjectName.localeCompare(b.subjectName, "fr", {
              sensitivity: "base",
            }),
          );

        return {
          classId: c.classId,
          className: c.className,
          gradeLevel: c.gradeLevel,
          subjects,
          studentCount: counts.get(c.classId) ?? 0,
        };
      });
    },
  });

  const totalStudents = classes.reduce((n, c) => n + c.studentCount, 0);
  const totalSubjects = new Set(
    classes.flatMap((c) => c.subjects.map((s) => s.subjectId)),
  ).size;

  return (
    <div>
      <PageHeader
        title="Mes classes"
        subtitle="Classes où vous enseignez — moyenne de classe par matière"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Classes
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {classes.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Élèves
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {totalStudents}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-[var(--border)] dark:bg-[var(--surface)] sm:px-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Matières
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {totalSubjects}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c) => (
              <Card
                key={c.classId}
                className="flex flex-col overflow-hidden border border-slate-200 bg-white p-0 transition hover:border-brand-300 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:hover:border-brand-700"
              >
                <Link
                  to={`/classes/${c.classId}`}
                  className="flex flex-1 flex-col outline-none ring-inset ring-brand-500 focus-visible:ring-2"
                >
                  <div className="px-4 pt-4">
                    <h2 className="truncate text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
                      {c.className}
                    </h2>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Users className="h-3 w-3 shrink-0" />
                      {c.studentCount} élève
                      {c.studentCount > 1 ? "s" : ""}
                      {c.gradeLevel ? ` · ${c.gradeLevel}` : ""}
                    </p>
                  </div>

                  <div className="mt-3 flex-1 space-y-2.5 px-4 pb-3">
                    {c.subjects.map((s) => (
                      <div key={s.subjectId}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {s.subjectName}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                              Moyenne de classe
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-lg font-bold tabular-nums leading-none text-brand-700">
                            {s.averageOn20 != null
                              ? formatAverage(s.averageOn20)
                              : "—"}
                            <span className="text-sm font-semibold text-slate-400">
                              {" "}
                              / 20
                            </span>
                          </p>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: scoreBarWidth(s.averageOn20) }}
                          />
                        </div>
                        {s.gradeCount > 0 ? (
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Calculée sur {s.gradeCount} note
                            {s.gradeCount > 1 ? "s" : ""}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Aucune note encore
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Link>

                <div className="grid grid-cols-3 border-t border-slate-100 dark:border-[var(--border)]">
                  <Link
                    to={`/classes/${c.classId}/notes`}
                    className="flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-brand-300"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Notes
                  </Link>
                  <Link
                    to={`/classes/${c.classId}/presences`}
                    className="flex items-center justify-center gap-1.5 border-x border-slate-100 px-2 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-brand-700 dark:border-[var(--border)] dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-brand-300"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Présences
                  </Link>
                  <Link
                    to={`/classes/${c.classId}`}
                    className="flex items-center justify-center gap-1 px-2 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-brand-300"
                  >
                    Détail
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
