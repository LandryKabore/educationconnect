import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, PencilLine } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  Badge,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

type TeacherAssignment = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  subjects: string[];
};

/**
 * School office can enter homework, grades, attendance and exams
 * on behalf of a teacher who has no connection.
 */
export default function SaisieEnseignant() {
  const { schoolId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [teacherId, setTeacherId] = useState(
    () => searchParams.get("teacherId") ?? "",
  );

  const { data: teachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ["enseignants", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles_utilisateurs")
        .select("profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "teacher")
        .eq("active", true);
      if (error) throw error;
      return (data ?? [])
        .map((r) => (r as unknown as { profils: Profile }).profils)
        .filter(Boolean)
        .sort((a, b) =>
          fullName(a.first_name, a.last_name).localeCompare(
            fullName(b.first_name, b.last_name),
            "fr",
          ),
        );
    },
  });

  const { data: assignments = [], isLoading: loadingAff } = useQuery({
    queryKey: ["saisie-affectations", schoolId, teacherId],
    enabled: !!schoolId && !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "class_section_id, classes(id, name, grade_level), matieres(name)",
        )
        .eq("teacher_id", teacherId);
      if (error) throw error;

      const byClass = new Map<string, TeacherAssignment>();
      for (const row of data ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          classes: ClassSection | null;
          matieres: { name: string } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        const existing = byClass.get(classId);
        const subject = r.matieres?.name;
        if (existing) {
          if (subject && !existing.subjects.includes(subject)) {
            existing.subjects.push(subject);
          }
        } else {
          byClass.set(classId, {
            classId,
            className: r.classes?.name ?? "Classe",
            gradeLevel: r.classes?.grade_level ?? null,
            subjects: subject ? [subject] : [],
          });
        }
      }

      const list = [...byClass.values()].map((c) => ({
        ...c,
        subjects: [...c.subjects].sort((a, b) =>
          a.localeCompare(b, "fr", { sensitivity: "base" }),
        ),
      }));

      const order = sortClassesByProgression(
        list.map((c) => ({
          id: c.classId,
          name: c.className,
          grade_level: c.gradeLevel,
        })),
      );
      const byId = new Map(list.map((c) => [c.classId, c]));
      return order.map((cls) => byId.get(cls.id)!).filter(Boolean);
    },
  });

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === teacherId) ?? null,
    [teachers, teacherId],
  );

  const teacherName = selectedTeacher
    ? fullName(selectedTeacher.first_name, selectedTeacher.last_name)
    : null;

  const onTeacherChange = (next: string) => {
    setTeacherId(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set("teacherId", next);
        else p.delete("teacherId");
        return p;
      },
      { replace: true },
    );
  };

  const q = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saisie pour un enseignant"
        subtitle="Quand un professeur n’a pas de connexion, l’administration peut saisir à sa place."
      />

      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <PencilLine className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Label htmlFor="saisie-teacher">Enseignant</Label>
            <Select
              id="saisie-teacher"
              className="mt-1"
              value={teacherId}
              onChange={(e) => onTeacherChange(e.target.value)}
              disabled={loadingTeachers}
            >
              <option value="">Choisir un enseignant…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t.first_name, t.last_name)}
                </option>
              ))}
            </Select>
            {teacherName ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Les saisies seront enregistrées au nom de{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {teacherName}
                </span>
                .
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Sélectionnez le professeur concerné, puis choisissez une action.
              </p>
            )}
          </div>
        </div>
      </Card>

      {!teacherId ? null : loadingAff ? (
        <p className="text-slate-500">Chargement des classes…</p>
      ) : assignments.length === 0 ? (
        <EmptyState message="Aucune classe affectée à cet enseignant." />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Par classe
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {assignments.map((c) => (
                <Card key={c.classId} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {c.className}
                        {c.gradeLevel ? (
                          <span className="ml-2 text-sm font-normal text-slate-500">
                            {c.gradeLevel}
                          </span>
                        ) : null}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.subjects.join(" · ") || "Aucune matière"}
                      </p>
                    </div>
                    <Badge tone="info">
                      {c.subjects.length} matière
                      {c.subjects.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/classes/${c.classId}/presences${q}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:border-brand-300 hover:text-brand-800 dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:text-slate-100"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Présences
                    </Link>
                    <Link
                      to={`/classes/${c.classId}/notes${q}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:border-brand-300 hover:text-brand-800 dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:text-slate-100"
                    >
                      <ClipboardList className="h-4 w-4" />
                      Devoirs & évaluations
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
