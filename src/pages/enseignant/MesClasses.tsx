import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList, Users } from "lucide-react";
import { ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type TeacherClass = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  subjects: string[];
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
        .select("class_section_id, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", user!.id);
      if (error) throw error;

      const byClass = new Map<
        string,
        {
          classId: string;
          className: string;
          gradeLevel: string | null;
          subjects: string[];
        }
      >();

      for (const row of aff ?? []) {
        const r = row as {
          class_section_id: string;
          classes: {
            id: string;
            name: string;
            grade_level: string | null;
          } | null;
          matieres: { name: string } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        const subject = r.matieres?.name ?? "Matière";
        const existing = byClass.get(classId);
        if (existing) {
          if (!existing.subjects.includes(subject)) {
            existing.subjects.push(subject);
          }
        } else {
          byClass.set(classId, {
            classId,
            className: r.classes?.name ?? "Classe",
            gradeLevel: r.classes?.grade_level ?? null,
            subjects: [subject],
          });
        }
      }

      const list = [...byClass.values()].map((c) => ({
        ...c,
        subjects: [...c.subjects].sort((a, b) =>
          a.localeCompare(b, "fr", { sensitivity: "base" }),
        ),
      }));

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

      const counts = new Map<string, number>();
      if (ordered.length > 0) {
        const { data: insc } = await supabase
          .from("inscriptions")
          .select("class_section_id")
          .in(
            "class_section_id",
            ordered.map((c) => c.classId),
          )
          .eq("status", "active");
        for (const row of insc ?? []) {
          const id = (row as { class_section_id: string }).class_section_id;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }

      return ordered.map(
        (c): TeacherClass => ({
          ...c,
          studentCount: counts.get(c.classId) ?? 0,
        }),
      );
    },
  });

  return (
    <div>
      <PageHeader
        title="Mes classes"
        subtitle="Classes où vous enseignez — matières regroupées"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => (
            <Card
              key={c.classId}
              data-class-color
              style={classColorVars({ id: c.classId, name: c.className })}
              className={cn("flex flex-col border p-4", CLASS_COLOR_SURFACE)}
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
              <p className="mt-1 text-sm leading-snug opacity-90">
                {c.subjects.join(" · ")}
              </p>

              <p className="mt-3 flex items-center gap-1.5 text-xs opacity-80">
                <Users className="h-3.5 w-3.5" />
                {c.studentCount} élève{c.studentCount > 1 ? "s" : ""}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/classes/${c.classId}`}>
                  <Button type="button" size="sm">
                    <BookOpen className="h-4 w-4" />
                    Ouvrir
                  </Button>
                </Link>
                <Link to={`/classes/${c.classId}/notes`}>
                  <Button type="button" size="sm" variant="outline">
                    Notes
                  </Button>
                </Link>
                <Link to={`/classes/${c.classId}/presences`}>
                  <Button type="button" size="sm" variant="outline">
                    <ClipboardList className="h-4 w-4" />
                    Présences
                  </Button>
                </Link>
                <Link to={`/mes-eleves?classe=${c.classId}`}>
                  <Button type="button" size="sm" variant="ghost">
                    Élèves
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
