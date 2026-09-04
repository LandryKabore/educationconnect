import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClassColorBadge, ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn, fullName, joinProfile, matchesSearch } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";

type ClassTab = {
  classId: string;
  className: string;
  gradeLevel: string | null;
};

type StudentRow = {
  id: string;
  studentId: string;
  classId: string;
  className: string;
  firstName: string;
  lastName: string;
};

export default function MesEleves() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");

  const selectedClassId = searchParams.get("classe") ?? "";

  const setSelectedClassId = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("classe", value);
    else next.delete("classe");
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["teacher-mes-eleves", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, classes(id, name, grade_level)")
        .eq("teacher_id", user!.id);
      if (error) throw error;

      const classMap = new Map<string, ClassTab>();
      for (const row of aff ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          classes: {
            id: string;
            name: string;
            grade_level: string | null;
          } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        if (!classMap.has(classId)) {
          classMap.set(classId, {
            classId,
            className: r.classes?.name ?? "Classe",
            gradeLevel: r.classes?.grade_level ?? null,
          });
        }
      }

      const classes = sortClassesByProgression(
        [...classMap.values()].map((c) => ({
          id: c.classId,
          name: c.className,
          grade_level: c.gradeLevel,
        })),
      ).map((c) => classMap.get(c.id)!);

      if (classes.length === 0) {
        return { classes: [] as ClassTab[], students: [] as StudentRow[] };
      }

      const classIds = classes.map((c) => c.classId);
      const { data: insc, error: inscError } = await supabase
        .from("inscriptions")
        .select(
          "id, class_section_id, profils:profils!inscriptions_student_id_fkey(id, first_name, last_name)",
        )
        .in("class_section_id", classIds)
        .eq("status", "active");
      if (inscError) throw inscError;

      const nameByClass = new Map(
        classes.map((c) => [c.classId, c.className] as const),
      );

      const students: StudentRow[] = (insc ?? [])
        .map((row) => {
          const r = row as {
            id: string;
            class_section_id: string;
            profils: unknown;
          };
          const profil = joinProfile<{
            id: string;
            first_name: string;
            last_name: string;
          }>(r.profils);
          if (!profil?.id) return null;
          return {
            id: r.id,
            studentId: profil.id,
            classId: r.class_section_id,
            className: nameByClass.get(r.class_section_id) ?? "Classe",
            firstName: profil.first_name,
            lastName: profil.last_name,
          };
        })
        .filter(Boolean) as StudentRow[];

      students.sort((a, b) =>
        fullName(a.firstName, a.lastName).localeCompare(
          fullName(b.firstName, b.lastName),
          "fr",
          { sensitivity: "base" },
        ),
      );

      return { classes, students };
    },
  });

  const classes = data?.classes ?? [];
  const students = data?.students ?? [];

  const filtered = useMemo(() => {
    let list = students;
    if (selectedClassId) {
      list = list.filter((s) => s.classId === selectedClassId);
    }
    if (search.trim()) {
      list = list.filter((s) =>
        matchesSearch(search, fullName(s.firstName, s.lastName), s.className),
      );
    }
    return list;
  }, [students, selectedClassId, search]);

  const selectedClass = classes.find((c) => c.classId === selectedClassId);

  return (
    <div>
      <PageHeader
        title="Mes élèves"
        subtitle="Élèves des classes où vous enseignez"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée — aucun élève à afficher." />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div>
              <Label>Classe</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedClassId("")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                    !selectedClassId
                      ? "border-brand-600 bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-50"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                  )}
                >
                  Toutes ({students.length})
                </button>
                {classes.map((c) => {
                  const count = students.filter(
                    (s) => s.classId === c.classId,
                  ).length;
                  const active = selectedClassId === c.classId;
                  return (
                    <button
                      key={c.classId}
                      type="button"
                      onClick={() => setSelectedClassId(c.classId)}
                      data-class-color
                      style={classColorVars({
                        id: c.classId,
                        name: c.className,
                      })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                        active
                          ? CLASS_COLOR_SURFACE
                          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <ClassColorDot id={c.classId} name={c.className} />
                      {c.className}
                      <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedClass ? (
              <ClassColorBadge
                id={selectedClass.classId}
                name={selectedClass.className}
              />
            ) : null}

            <div className="max-w-md">
              <Label htmlFor="search-mes-eleves">Rechercher</Label>
              <Input
                id="search-mes-eleves"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom de l’élève…"
              />
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState
              message={
                search.trim()
                  ? "Aucun élève ne correspond à la recherche."
                  : "Aucun élève dans cette sélection."
              }
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500 dark:border-slate-600 dark:bg-[var(--surface-2)]">
                      <th className="px-4 py-3 font-medium">Élève</th>
                      <th className="px-4 py-3 font-medium">Classe</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-700"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <PersonName first={s.firstName} last={s.lastName} />
                        </td>
                        <td className="px-4 py-3">
                          <ClassColorBadge
                            id={s.classId}
                            name={s.className}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to={`/classes/${s.classId}/notes`}
                              className="text-sm font-medium text-brand-700 hover:underline"
                            >
                              Notes
                            </Link>
                            <Link
                              to={`/classes/${s.classId}/presences`}
                              className="text-sm font-medium text-brand-700 hover:underline"
                            >
                              Présences
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-700">
                {filtered.length} élève{filtered.length > 1 ? "s" : ""}
                {selectedClass
                  ? ` · ${selectedClass.className}`
                  : " · toutes vos classes"}
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
