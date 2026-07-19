import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { generateBulletinPdf } from "@/lib/pdfBulletin";
import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { fetchEnrollmentsByStudent } from "@/lib/programmeCounts";
import type { ClassSection, GradeRow, Profile, School, Subject } from "@/lib/types";
import { cn, fullName, matchesSearch } from "@/lib/utils";
import { ClassColorBadge, ClassColorDot } from "@/components/ClassColor";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

type StudentRow = Profile & {
  className: string | null;
  classSectionId: string | null;
};

export default function Bulletins() {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState<string>(TRIMESTER_PERIODS[0]);
  const [generating, setGenerating] = useState(false);

  const selectedClassId = searchParams.get("classe") ?? "";
  const search = searchParams.get("q") ?? "";

  const setSelectedClassId = (value: string) => {
    setStudentId("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("classe", value);
        else next.delete("classe");
        next.delete("q");
        return next;
      },
      { replace: true },
    );
  };

  const setSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trim()) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  };

  const { data: classesRaw = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as ClassSection[];
    },
  });
  const classes = useMemo(
    () => sortClassesByProgression(classesRaw),
    [classesRaw],
  );

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["eleves", schoolId, "v4"],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      if (error) throw error;
      const profiles = (roles ?? []).map(
        (r) => (r as unknown as { profils: Profile }).profils,
      );
      if (!profiles.length) return [] as StudentRow[];

      const classByStudent = await fetchEnrollmentsByStudent(schoolId!);

      return profiles.map((p) => {
        const cls = classByStudent.get(p.id);
        return {
          ...p,
          className: cls?.name ?? null,
          classSectionId: cls?.id ?? null,
        };
      }) as StudentRow[];
    },
  });

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students
      .filter((s) => s.classSectionId === selectedClassId)
      .filter((s) =>
        matchesSearch(search, s.first_name, s.last_name, s.matricule),
      )
      .sort((a, b) =>
        fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
          { sensitivity: "base" },
        ),
      );
  }, [students, selectedClassId, search]);

  const selectedStudent = students.find((s) => s.id === studentId);

  const handleGenerate = async () => {
    if (!studentId || !school) {
      toast.error("Sélectionnez un élève");
      return;
    }
    setGenerating(true);

    const student = students.find((s) => s.id === studentId);
    if (!student) {
      setGenerating(false);
      return;
    }

    const { data: enrollment } = await supabase
      .from("inscriptions")
      .select("*, classes(name)")
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();

    const classSectionId =
      (enrollment as { class_section_id?: string } | null)?.class_section_id ??
      student.classSectionId ??
      undefined;

    const { data: allGradesRaw } = await supabase
      .from("notes")
      .select("*, matieres(*)")
      .eq("student_id", studentId)
      .in("period_label", [...TRIMESTER_PERIODS]);

    const allGrades = (
      (allGradesRaw ?? []) as (GradeRow & { matieres: Subject })[]
    ).map((g) => ({
      ...g,
      subject: g.matieres,
    }));

    const grades =
      period === ANNUAL_PERIOD_LABEL
        ? []
        : allGrades.filter((g) => g.period_label === period);

    let coefficientBySubject: Record<string, number> = {};
    if (classSectionId) {
      const { data: programme } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", classSectionId);
      for (const row of programme ?? []) {
        coefficientBySubject[row.subject_id as string] = Number(row.coefficient);
      }
    }

    const className =
      (enrollment as { classes?: { name: string } } | null)?.classes?.name ??
      student.className ??
      "—";

    if (period !== ANNUAL_PERIOD_LABEL && grades.length === 0) {
      toast.message("Aucune note pour cette période");
      setGenerating(false);
      return;
    }
    if (period === ANNUAL_PERIOD_LABEL && allGrades.length === 0) {
      toast.message("Aucune note sur l’année");
      setGenerating(false);
      return;
    }

    const doc = generateBulletinPdf({
      school: school as School,
      student,
      className,
      periodLabel: period,
      coefficientBySubject,
      grades,
      allGrades,
    });

    const filePeriod =
      period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");
    doc.save(`bulletin-${student.last_name}-${filePeriod}.pdf`);
    toast.success("Bulletin téléchargé");
    setGenerating(false);
  };

  return (
    <div>
      <PageHeader
        title="Bulletins"
        subtitle="Choisissez une classe, recherchez un élève, puis téléchargez le PDF"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève disponible." />
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe configurée." />
      ) : (
        <div className="space-y-4">
          <Card className="max-w-xl space-y-3">
            <div>
              <Label htmlFor="filter-classe-bulletins">Classe</Label>
              <Select
                id="filter-classe-bulletins"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="">Choisir une classe…</option>
                {classes.map((c) => {
                  const count = students.filter(
                    (s) => s.classSectionId === c.id,
                  ).length;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({count})
                    </option>
                  );
                })}
              </Select>
            </div>

            {selectedClass ? (
              <ClassColorBadge id={selectedClass.id} name={selectedClass.name} />
            ) : null}

            {classes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClassId(c.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition",
                      selectedClassId === c.id
                        ? "border-brand-300 bg-brand-50 text-brand-900 dark:bg-brand-900/40 dark:text-brand-50"
                        : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                    )}
                    title={c.name}
                  >
                    <ClassColorDot id={c.id} name={c.name} />
                    <span className="max-w-[5.5rem] truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          {!selectedClassId ? (
            <EmptyState message="Choisissez une classe pour afficher les élèves." />
          ) : (
            <>
              <Card className="max-w-xl space-y-4">
                <div>
                  <Label htmlFor="search-bulletins">Rechercher un élève</Label>
                  <Input
                    id="search-bulletins"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, prénom, matricule…"
                  />
                </div>

                <div>
                  <Label>Période</Label>
                  <Select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    {TRIMESTER_PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value={ANNUAL_PERIOD_LABEL}>
                      Année (moyenne annuelle)
                    </option>
                  </Select>
                  <p className="mt-1 text-xs text-slate-500">
                    La moyenne annuelle = (T1 + T2 + T3) / 3. Admission à partir
                    de 10 / 20.
                  </p>
                </div>

                {selectedStudent ? (
                  <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm dark:border-brand-800 dark:bg-brand-900/30">
                    Élève sélectionné :{" "}
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {fullName(
                        selectedStudent.first_name,
                        selectedStudent.last_name,
                      )}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Sélectionnez un élève dans la liste ci-dessous.
                  </p>
                )}

                <Button
                  onClick={() => void handleGenerate()}
                  disabled={generating || !studentId}
                >
                  <Download className="h-4 w-4" />
                  {generating
                    ? "Génération…"
                    : "Télécharger le bulletin PDF"}
                </Button>
              </Card>

              {filteredStudents.length === 0 ? (
                <EmptyState
                  message={
                    search.trim()
                      ? "Aucun élève ne correspond à la recherche."
                      : "Aucun élève dans cette classe."
                  }
                />
              ) : (
                <Card className="overflow-hidden p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500 dark:border-slate-600 dark:bg-[var(--surface-2)]">
                          <th className="px-4 py-3 font-medium">Élève</th>
                          <th className="px-4 py-3 font-medium">Matricule</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((s) => {
                          const active = s.id === studentId;
                          return (
                            <tr
                              key={s.id}
                              className={cn(
                                "border-b border-slate-100 last:border-0 dark:border-slate-700",
                                active &&
                                  "bg-brand-50/70 dark:bg-brand-900/25",
                              )}
                            >
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                                {fullName(s.first_name, s.last_name)}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {s.matricule || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={active ? "primary" : "outline"}
                                  onClick={() => setStudentId(s.id)}
                                >
                                  {active ? "Sélectionné" : "Sélectionner"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-700">
                    {filteredStudents.length} élève
                    {filteredStudents.length !== 1 ? "s" : ""}
                    {selectedClass ? ` · ${selectedClass.name}` : ""}
                  </p>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
