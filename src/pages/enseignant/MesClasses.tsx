import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatAverage, scoreOn20 } from "@/lib/averages";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type SubjectAvg = {
  subjectId: string;
  subjectName: string;
  /** Class average on /20 for this subject, or null if no grades yet. */
  averageOn20: number | null;
};

type TeacherClass = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  subjects: SubjectAvg[];
  studentCount: number;
};

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

      // All grades for these classes/subjects → class average per matière.
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
            return { subjectId, subjectName, averageOn20 };
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

  return (
    <div>
      <PageHeader
        title="Mes classes"
        subtitle="Classes où vous enseignez — matières et moyennes"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <Link
              key={c.classId}
              to={`/classes/${c.classId}`}
              className="block rounded-xl outline-none ring-brand-500 focus-visible:ring-2"
            >
              <Card
                data-class-color
                style={classColorVars({ id: c.classId, name: c.className })}
                className={cn(
                  "flex h-full flex-col border p-4 transition hover:brightness-[0.97] dark:hover:brightness-110",
                  CLASS_COLOR_SURFACE,
                )}
              >
                <div className="flex items-start gap-2">
                  <ClassColorDot
                    id={c.classId}
                    name={c.className}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">
                      {c.className}
                    </h2>
                    {c.gradeLevel ? (
                      <p className="text-xs opacity-75">{c.gradeLevel}</p>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-xs font-medium uppercase tracking-wide opacity-70">
                  Matières ({c.subjects.length})
                </p>
                <ul className="mt-1 space-y-2">
                  {c.subjects.map((s) => (
                    <li
                      key={s.subjectId}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="min-w-0 truncate opacity-90">
                        {s.subjectName}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {s.averageOn20 != null
                          ? `${formatAverage(s.averageOn20)} / 20`
                          : "— / 20"}
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 flex items-center gap-1.5 text-xs opacity-80">
                  <Users className="h-3.5 w-3.5" />
                  {c.studentCount} élève{c.studentCount > 1 ? "s" : ""}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
