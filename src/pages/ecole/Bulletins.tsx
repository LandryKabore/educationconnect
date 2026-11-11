import { useEffect, useMemo, useState } from "react";
import { zipSync } from "fflate";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
  type StudentPageRow,
} from "@/lib/scaleApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageParams } from "@/hooks/usePageParams";
import type { ClassSection, School } from "@/lib/types";
import { downloadBlob } from "@/lib/studentCsv";
import { fullName } from "@/lib/utils";
import { ClassColorBadge } from "@/components/ClassColor";
import { ClassFilter } from "@/components/ClassFilter";
import { DocumentsRegister } from "@/components/DocumentsRegister";
import { BulletinView } from "@/components/BulletinView";
import { SearchField } from "@/components/SearchField";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import {
  Button,
  Card,
  EmptyState,
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

  const { page, pageSize, setPage, setPageSize } = usePageParams();
  // "" = tous les élèves, "__none__" = sans classe, sinon l'id d'une classe
  const selectedClassId = searchParams.get("classe") ?? "";
  const search = searchParams.get("q") ?? "";

  const setSelectedClassId = (value: string) => {
    setStudentId("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("classe", value);
        else next.delete("classe");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const setSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trimStart()) next.set("q", value);
        else next.delete("q");
        next.delete("page");
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

  // All students by default; the list is fetched one page at a time and searched by the
  // database.
  const debouncedSearch = useDebouncedValue(search, 300);
  const {
    data: studentsPage,
    isLoading: studentsLoading,
    isFetching: studentsFetching,
  } = useQuery({
    queryKey: [
      "bulletin-students",
      schoolId,
      "v2",
      selectedClassId,
      debouncedSearch,
      page,
      pageSize,
    ],
    // keep the list on screen while typing a search
    placeholderData: keepPreviousData,
    enabled: !!schoolId,
    queryFn: () =>
      fetchStudentsPage(schoolId!, {
        classId: selectedClassId,
        search: debouncedSearch,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });
  const students = useMemo(
    () => (studentsPage?.rows ?? []) as StudentRow[],
    [studentsPage],
  );
  const filteredTotal = studentsPage?.total ?? 0;

  // a page number from an old link that no longer exists → last page
  useEffect(() => {
    if (!studentsPage || studentsFetching) return;
    const last = Math.max(1, Math.ceil(studentsPage.total / pageSize));
    if (page > last) setPage(last);
  }, [studentsPage, studentsFetching, page, pageSize, setPage]);

  const { data: classCounts = {}, isLoading: countsLoading } = useQuery({
    queryKey: ["eleves-class-counts", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchClassStudentCounts(schoolId!),
  });
  const totalStudents = Object.values(classCounts).reduce((n, v) => n + v, 0);
  const isLoading = countsLoading || studentsLoading;

  // the whole-class ZIP needs a real class (not "all" nor "sans classe")
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // keep the picked student even if a new search no longer lists them
  const [pickedStudent, setPickedStudent] = useState<StudentRow | null>(null);
  const selectedStudent =
    students.find((s) => s.id === studentId) ??
    (pickedStudent?.id === studentId ? pickedStudent : undefined);

  /** Official PDF for the selected pupil (registers its QR code). */
  const buildSelectedPdf = async () => {
    const student = selectedStudent;
    if (!studentId || !school || !student) throw new Error("Sélectionnez un élève");

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

    if (!classSectionId) throw new Error("Cet élève n’est pas inscrit dans une classe");

    const coefficientBySubject: Record<string, number> = {};
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

    return buildBulletinPdf({
      school: school as School,
      student,
      classSectionId,
      className,
      periodLabel: period,
      coefficientBySubject,
    });
  };

  const filePeriod =
    period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");

  const handleGenerate = async () => {
    if (!studentId || !school || !selectedStudent) {
      toast.error("Sélectionnez un élève");
      return;
    }
    setGenerating(true);
    try {
      const doc = await buildSelectedPdf();
      doc.save(`bulletin-${selectedStudent.last_name}-${filePeriod}.pdf`);
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

  const studentColumns: DataTableColumn<StudentRow>[] = [
    {
      key: "eleve",
      header: "Élève",
      cell: (s) => (
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {fullName(s.first_name, s.last_name)}
        </span>
      ),
    },
    {
      key: "classe",
      header: "Classe",
      cell: (s) =>
        s.classSectionId && s.className ? (
          <ClassColorBadge id={s.classSectionId} name={s.className} />
        ) : (
          <span className="text-xs font-medium text-amber-700">Sans classe</span>
        ),
    },
    {
      key: "matricule",
      header: "Matricule",
      hideBelowLg: true,
      cell: (s) => (
        <span className="text-slate-600 dark:text-slate-300">{s.matricule || "—"}</span>
      ),
    },
    {
      key: "action",
      header: <span className="sr-only">Action</span>,
      className: "w-36 text-right",
      cell: (s) => pickButton(s),
    },
  ];

  const pickButton = (s: StudentRow) => {
    const active = s.id === studentId;
    return (
      <Button
        type="button"
        size="sm"
        variant={active ? "primary" : "outline"}
        disabled={!s.classSectionId}
        title={s.classSectionId ? undefined : "Cet élève n’est pas inscrit dans une classe"}
        onClick={() => {
          setStudentId(s.id);
          setPickedStudent(s);
        }}
      >
        {active ? "Sélectionné" : "Sélectionner"}
      </Button>
    );
  };

  const studentMobileRow = (s: StudentRow) => (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900 dark:text-slate-100">
          {fullName(s.first_name, s.last_name)}
        </p>
        <p className="text-xs text-slate-500">
          {s.className || "Sans classe"}
          {s.matricule ? ` · ${s.matricule}` : ""}
        </p>
      </div>
      {pickButton(s)}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Bulletins"
        subtitle="Recherchez un élève (toutes classes, ou filtrez par classe), puis téléchargez le PDF"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : totalStudents === 0 ? (
        <EmptyState message="Aucun élève disponible." />
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe configurée." />
      ) : (
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.2fr)]">
              <div>
                <Label htmlFor="search-bulletins">Rechercher un élève</Label>
                <SearchField
                  id="search-bulletins"
                  value={search}
                  onChange={setSearch}
                  placeholder="Nom, prénom, matricule…"
                />
              </div>
              <div>
                <Label htmlFor="filter-classe-bulletins">Classe</Label>
                <ClassFilter
                  id="filter-classe-bulletins"
                  value={selectedClassId}
                  onChange={setSelectedClassId}
                  classes={classes}
                  counts={classCounts}
                  total={totalStudents}
                />
              </div>
              <div>
                <Label htmlFor="period-bulletins">Période</Label>
                <Select
                  id="period-bulletins"
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
                  <option value={ANNUAL_PERIOD_LABEL}>Année (moyenne annuelle)</option>
                </Select>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Bulletin A4 officiel : moyenne, total, rang et appréciation automatique par
              matière ; mention et appréciation du conseil selon la moyenne générale.
            </p>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
              {selectedStudent ? (
                <p className="mr-auto text-sm">
                  Élève sélectionné :{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {fullName(selectedStudent.first_name, selectedStudent.last_name)}
                  </span>
                </p>
              ) : (
                <p className="mr-auto text-sm text-slate-500">
                  Sélectionnez un élève dans la liste ci-dessous.
                </p>
              )}
              <Button
                onClick={() => void handleGenerate()}
                disabled={generating || !studentId}
              >
                <Download className="h-4 w-4" />
                {generating ? "Génération…" : "Télécharger le bulletin PDF"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleGenerateClass()}
                disabled={!!classProgress || generating || !selectedClass}
                title={selectedClass ? undefined : "Choisissez une classe pour télécharger toute la classe"}
              >
                <FolderDown className="h-4 w-4" />
                {classProgress
                  ? `Génération… ${classProgress.done}/${classProgress.total || "…"}`
                  : "Toute la classe (ZIP)"}
              </Button>
            </div>
          </Card>

          {selectedStudent?.classSectionId ? (
            <Card className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Aperçu — {fullName(selectedStudent.first_name, selectedStudent.last_name)}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Ce que voient l’élève et ses parents. Le code QR n’est créé qu’au téléchargement du PDF.
                </p>
              </div>
              <div className="max-w-2xl">
                <BulletinView
                  studentId={selectedStudent.id}
                  classSectionId={selectedStudent.classSectionId}
                  periods={BULLETIN_PERIODS}
                  period={period}
                  onPeriodChange={(next) => {
                    setPeriod(next);
                    writeStoredGradingPeriod(next);
                  }}
                  buildPdf={buildSelectedPdf}
                  fileName={`bulletin-${selectedStudent.last_name}-${filePeriod}.pdf`}
                  stickyActions={false}
                />
              </div>
            </Card>
          ) : null}

          {students.length === 0 ? (
            <Card className="space-y-3 p-4">
              <EmptyState
                message={
                  debouncedSearch.trim()
                    ? `Aucun élève ne correspond à « ${debouncedSearch.trim()} ».`
                    : "Aucun élève dans cette classe."
                }
              />
              {debouncedSearch.trim() || selectedClassId ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchParams(
                        (prev) => {
                          const next = new URLSearchParams(prev);
                          next.delete("q");
                          next.delete("classe");
                          next.delete("page");
                          return next;
                        },
                        { replace: true },
                      );
                    }}
                  >
                    Effacer les filtres
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <DataTable
                rows={students}
                columns={studentColumns}
                mobileRow={studentMobileRow}
                dimmed={studentsFetching}
              />
              <Pagination
                total={filteredTotal}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="élève"
                busy={studentsFetching}
              />
            </Card>
          )}
        </div>
      )}
      <DocumentsRegister />
    </div>
  );
}
