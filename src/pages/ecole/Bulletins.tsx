import { useMemo, useState } from "react";
import { zipSync } from "fflate";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Download, FolderDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { buildBulletinPdf } from "@/lib/bulletinData";
import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import {
  initialGradingPeriod,
  writeStoredGradingPeriod,
} from "@/lib/gradingPeriod";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  fetchAllStudents,
  fetchClassStudentCounts,
  fetchStudentsPage,
  PAGE_SIZE,
  type StudentPageRow,
} from "@/lib/scaleApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ClassSection, School } from "@/lib/types";
import { downloadBlob } from "@/lib/studentCsv";
import { cn, fullName } from "@/lib/utils";
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

type StudentRow = StudentPageRow;

const BULLETIN_PERIODS = [...TRIMESTER_PERIODS, ANNUAL_PERIOD_LABEL] as const;

export default function Bulletins() {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState(() =>
    initialGradingPeriod(BULLETIN_PERIODS),
  );
  const [generating, setGenerating] = useState(false);
  const [classProgress, setClassProgress] = useState<{ done: number; total: number } | null>(null);

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

  // The class list is fetched one page at a time and searched by the database.
  const debouncedSearch = useDebouncedValue(search, 300);
  const {
    data: pages,
    isLoading: studentsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["bulletin-students", schoolId, selectedClassId, debouncedSearch],
    // keep the list on screen while typing a search
    placeholderData: keepPreviousData,
    enabled: !!schoolId && !!selectedClassId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchStudentsPage(schoolId!, {
        classId: selectedClassId,
        search: debouncedSearch,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const students = useMemo(
    () => (pages?.pages ?? []).flatMap((p) => p.rows) as StudentRow[],
    [pages],
  );
  const filteredStudents = students;
  const filteredTotal = pages?.pages[0]?.total ?? 0;

  const { data: classCounts = {}, isLoading: countsLoading } = useQuery({
    queryKey: ["eleves-class-counts", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchClassStudentCounts(schoolId!),
  });
  const totalStudents = Object.values(classCounts).reduce((n, v) => n + v, 0);
  const isLoading = countsLoading || (studentsLoading && !!selectedClassId);

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // keep the picked student even if a new search no longer lists them
  const [pickedStudent, setPickedStudent] = useState<StudentRow | null>(null);
  const selectedStudent =
    students.find((s) => s.id === studentId) ??
    (pickedStudent?.id === studentId ? pickedStudent : undefined);

  const handleGenerate = async () => {
    if (!studentId || !school) {
      toast.error("Sélectionnez un élève");
      return;
    }
    setGenerating(true);

    const student = selectedStudent;
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

    if (!classSectionId) {
      toast.error("Cet élève n’est pas inscrit dans une classe");
      setGenerating(false);
      return;
    }

    let coefficientBySubject: Record<string, number> = {};
    const { data: programme } = await supabase
      .from("programme_classe")
      .select("subject_id, coefficient")
      .eq("class_section_id", classSectionId);
    for (const row of programme ?? []) {
      coefficientBySubject[row.subject_id as string] = Number(row.coefficient);
    }

    const className =
      (enrollment as { classes?: { name: string } } | null)?.classes?.name ??
      student.className ??
      "—";

    try {
      const doc = await buildBulletinPdf({
        school: school as School,
        student,
        classSectionId,
        className,
        periodLabel: period,
        coefficientBySubject,
      });

      const filePeriod =
        period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");
      doc.save(`bulletin-${student.last_name}-${filePeriod}.pdf`);
      toast.success("Bulletin téléchargé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setGenerating(false);
    }
  };

  /** Whole class in one click: one PDF per student, delivered as a single .zip. */
  const handleGenerateClass = async () => {
    if (!school || !selectedClass || !schoolId) return;
    if (classProgress) return;
    setClassProgress({ done: 0, total: 0 });
    try {
      const roster = await fetchAllStudents(schoolId, { classId: selectedClass.id });
      if (roster.length === 0) {
        toast.error("Aucun élève dans cette classe");
        return;
      }
      const coefficientBySubject: Record<string, number> = {};
      const { data: programme, error: progErr } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", selectedClass.id);
      if (progErr) throw progErr;
      for (const row of programme ?? []) {
        coefficientBySubject[row.subject_id as string] = Number(row.coefficient);
      }

      const filePeriod =
        period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");
      const files: Record<string, Uint8Array> = {};
      const failed: string[] = [];
      let done = 0;
      setClassProgress({ done: 0, total: roster.length });

      // 3 at a time keeps the browser and the database comfortable.
      let next = 0;
      const worker = async () => {
        while (next < roster.length) {
          const student = roster[next++];
          try {
            const doc = await buildBulletinPdf({
              school: school as School,
              student,
              classSectionId: selectedClass.id,
              className: selectedClass.name,
              periodLabel: period,
              coefficientBySubject,
            });
            const buf = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
            const base = `bulletin-${student.last_name}-${student.first_name}-${filePeriod}`
              .replace(/[^\p{L}\p{N}_-]+/gu, "-");
            let name = `${base}.pdf`;
            for (let n = 2; files[name]; n++) name = `${base}-${n}.pdf`;
            files[name] = buf;
          } catch {
            failed.push(fullName(student.first_name, student.last_name));
          }
          done += 1;
          setClassProgress({ done, total: roster.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      const made = Object.keys(files).length;
      if (made === 0) {
        toast.error("Aucun bulletin généré (pas de notes pour cette période ?)");
        return;
      }
      const zip = zipSync(files, { level: 0 });
      downloadBlob(
        `bulletins-${selectedClass.name.replace(/\s+/g, "-")}-${filePeriod}.zip`,
        new Blob([zip as BlobPart], { type: "application/zip" }),
      );
      toast.success(
        failed.length
          ? `${made} bulletin(s) téléchargés — ${failed.length} sans notes : ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`
          : `${made} bulletin(s) téléchargés`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setClassProgress(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Bulletins"
        subtitle="Choisissez une classe, recherchez un élève, puis téléchargez le PDF"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : totalStudents === 0 ? (
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
                  const count = classCounts[c.id] ?? 0;
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
                    onChange={(e) => {
                      const next = e.target.value;
                      setPeriod(next);
                      writeStoredGradingPeriod(next);
                    }}
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
                    Moyennes par matière avec comparaison classe (élève /
                    clas. / min / max / écart). Mention automatique selon la
                    moyenne générale.
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleGenerateClass()}
                  disabled={!!classProgress || generating}
                >
                  <FolderDown className="h-4 w-4" />
                  {classProgress
                    ? `Génération… ${classProgress.done}/${classProgress.total || "…"}`
                    : "Toute la classe (ZIP)"}
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
                                  onClick={() => {
                                    setStudentId(s.id);
                                    setPickedStudent(s);
                                  }}
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
                    {filteredTotal} élève
                    {filteredTotal !== 1 ? "s" : ""}
                    {selectedClass ? ` · ${selectedClass.name}` : ""}
                    {filteredStudents.length < filteredTotal
                      ? ` (affichage de ${filteredStudents.length} sur ${filteredTotal})`
                      : ""}
                  </p>
                  {hasNextPage ? (
                    <div className="flex justify-center border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isFetchingNextPage}
                        onClick={() => void fetchNextPage()}
                      >
                        {isFetchingNextPage
                          ? "Chargement…"
                          : `Afficher plus (${filteredTotal - filteredStudents.length} restants)`}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
