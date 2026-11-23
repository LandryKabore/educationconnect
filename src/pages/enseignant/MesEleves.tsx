import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ClipboardCheck, NotebookPen, Search, UserRound, Users } from "lucide-react";
import { ClassColorDot } from "@/components/ClassColor";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import type { EvaluationType } from "@/lib/types";
import { BackLink, Card, EmptyState } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn, fullName, joinProfile, matchesSearch } from "@/lib/utils";

type ClassTab = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  /** subjects this teacher teaches in the class */
  subjects: { id: string; name: string }[];
};

type StudentRow = {
  id: string;
  studentId: string;
  classId: string;
  className: string;
  firstName: string;
  lastName: string;
};

const initialsOf = (first?: string | null, last?: string | null) =>
  `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase() || "?";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** Teacher: the students of every class taught, with a short profile in the teacher's subject. */
export default function MesEleves() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const selectedClassId = searchParams.get("classe") ?? "";
  const selectedStudentId = searchParams.get("eleve") ?? "";
  // opened on a class or a student from another page (class card, class page…): offer the way back
  const [openedFromLink] = useState(() => !!(searchParams.get("classe") || searchParams.get("eleve")));

  const setParam = (key: "classe" | "eleve", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "classe") next.delete("eleve");
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["teacher-mes-eleves", user?.id, "v2"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, subject_id, classes(id, name, grade_level), matieres(name)")
        .eq("teacher_id", user!.id);
      if (error) throw error;

      const classMap = new Map<string, ClassTab>();
      for (const row of aff ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          subject_id: string;
          classes: { id: string; name: string; grade_level: string | null } | null;
          matieres: { name: string } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        const c = classMap.get(classId) ?? {
          classId,
          className: r.classes?.name ?? "Classe",
          gradeLevel: r.classes?.grade_level ?? null,
          subjects: [],
        };
        if (!c.subjects.some((s) => s.id === r.subject_id)) c.subjects.push({ id: r.subject_id, name: r.matieres?.name ?? "Matière" });
        classMap.set(classId, c);
      }

      const classes = sortClassesByProgression(
        [...classMap.values()].map((c) => ({ id: c.classId, name: c.className, grade_level: c.gradeLevel })),
      ).map((c) => classMap.get(c.id)!);
      if (classes.length === 0) return { classes: [] as ClassTab[], students: [] as StudentRow[] };

      const nameByClass = new Map(classes.map((c) => [c.classId, c.className] as const));
      const { data: insc, error: inscError } = await supabase
        .from("inscriptions")
        .select("id, class_section_id, profils:profils!inscriptions_student_id_fkey(id, first_name, last_name)")
        .in("class_section_id", classes.map((c) => c.classId))
        .eq("status", "active")
        .limit(5000);
      if (inscError) throw inscError;

      const students = (insc ?? [])
        .map((row) => {
          const r = row as { id: string; class_section_id: string; profils: unknown };
          const p = joinProfile<{ id: string; first_name: string; last_name: string }>(r.profils);
          if (!p?.id) return null;
          return {
            id: r.id,
            studentId: p.id,
            classId: r.class_section_id,
            className: nameByClass.get(r.class_section_id) ?? "Classe",
            firstName: p.first_name,
            lastName: p.last_name,
          };
        })
        .filter(Boolean) as StudentRow[];
      students.sort((a, b) =>
        fullName(a.firstName, a.lastName).localeCompare(fullName(b.firstName, b.lastName), "fr", { sensitivity: "base" }),
      );
      return { classes, students };
    },
  });

  const classes = useMemo(() => data?.classes ?? [], [data]);
  const students = useMemo(() => data?.students ?? [], [data]);
  const filtered = useMemo(() => {
    let list = students;
    if (selectedClassId) list = list.filter((s) => s.classId === selectedClassId);
    if (search.trim()) list = list.filter((s) => matchesSearch(search, fullName(s.firstName, s.lastName), s.className));
    return list;
  }, [students, selectedClassId, search]);
  const selectedClass = classes.find((c) => c.classId === selectedClassId);
  const selected = students.find((s) => s.studentId === selectedStudentId) ?? null;
  const selectedSubjects = selected ? classes.find((c) => c.classId === selected.classId)?.subjects ?? [] : [];

  return (
    <div>
      {openedFromLink ? <BackLink to="/mes-classes" label="Mes classes" /> : null}
      <PageBanner
        title="Mes élèves"
        subtitle="Les élèves des classes où vous enseignez, avec leur suivi dans votre matière."
        stats={[
          { label: "Élèves", value: String(students.length), hint: "dans vos classes" },
          { label: "Classes", value: String(classes.length), hint: "où vous enseignez" },
          {
            label: selectedClass ? selectedClass.className : "Affichés",
            value: String(filtered.length),
            hint: selectedClass ? "élèves dans cette classe" : search.trim() ? "résultats" : "toutes classes",
          },
        ]}
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée — aucun élève à afficher." />
      ) : (
        <div className="grid gap-6 lg:h-[calc(100dvh-22rem)] lg:min-h-[360px] lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
          {/* ── Classes ── */}
          <Card className="flex min-h-0 flex-col p-0">
            <p className="shrink-0 border-b border-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-[var(--border)]">
              Classes
            </p>
            <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              <ClassItem
                active={!selectedClassId}
                label="Toutes"
                count={students.length}
                onClick={() => setParam("classe", "")}
              />
              {classes.map((c) => (
                <ClassItem
                  key={c.classId}
                  active={selectedClassId === c.classId}
                  label={c.className}
                  sub={c.subjects.map((s) => s.name).join(", ")}
                  count={students.filter((s) => s.classId === c.classId).length}
                  dot={<ClassColorDot id={c.classId} name={c.className} />}
                  onClick={() => setParam("classe", c.classId)}
                />
              ))}
            </nav>
          </Card>

          {/* ── Students ── */}
          <Card className="flex min-h-0 flex-col p-0">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-[var(--border)]">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Chercher un élève…"
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
                />
              </label>
              <span className="shrink-0 text-xs font-semibold text-slate-500">
                {filtered.length} élève{filtered.length > 1 ? "s" : ""}
              </span>
            </div>
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                {search.trim() ? "Aucun élève ne correspond à la recherche." : "Aucun élève dans cette sélection."}
              </p>
            ) : (
              <ul className="grid min-h-0 flex-1 content-start overflow-y-auto sm:grid-cols-2 xl:grid-cols-1 min-[1800px]:grid-cols-2">
                {filtered.map((s) => {
                  const active = s.studentId === selectedStudentId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setParam("eleve", active ? "" : s.studentId)}
                        title={fullName(s.firstName, s.lastName)}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-2.5 text-left transition dark:border-b-[var(--border)]",
                          active
                            ? "border-l-brand-700 bg-brand-50 dark:bg-brand-900/30"
                            : "border-l-transparent hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          {initialsOf(s.firstName, s.lastName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {fullName(s.firstName, s.lastName)}
                          </span>
                          {!selectedClassId ? (
                            <span className="flex items-center gap-1.5 text-xs text-slate-500">
                              <ClassColorDot id={s.classId} name={s.className} />
                              {s.className}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ── Selected student (wide screens beside, otherwise below) ── */}
          <Card className="flex min-h-0 flex-col p-0 lg:col-span-2 xl:col-span-1">
            {selected ? (
              <StudentProfile student={selected} subjects={selectedSubjects} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  <UserRound className="h-6 w-6" />
                </span>
                <p className="mt-3 font-bold text-slate-900 dark:text-slate-50">Choisissez un élève</p>
                <p className="mt-1 text-sm text-slate-500">Sa moyenne, ses dernières notes et ses absences dans votre matière.</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function ClassItem({
  active,
  label,
  sub,
  count,
  dot,
  onClick,
}: {
  active: boolean;
  label: string;
  sub?: string;
  count: number;
  dot?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition",
        active ? "bg-brand-50 text-brand-900 dark:bg-brand-950/40 dark:text-brand-100" : "hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
      )}
    >
      {dot ?? <Users className="h-3.5 w-3.5 text-slate-400" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
        {sub ? <span className="block truncate text-[11px] text-slate-500">{sub}</span> : null}
      </span>
      <span className="text-xs font-semibold tabular-nums text-slate-500">{count}</span>
    </button>
  );
}

/** Average, latest grades and attendance of one student, in the teacher's subjects for that class. */
function StudentProfile({ student, subjects }: { student: StudentRow; subjects: { id: string; name: string }[] }) {
  const subjectIds = subjects.map((s) => s.id);
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-student-profile", student.studentId, subjectIds.join(",")],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const [notesRes, presRes] = await Promise.all([
        supabase
          .from("notes")
          .select("id, score, max_score, is_absent, period_label, created_at, subject_id, evaluations(title, type, eval_date)")
          .eq("student_id", student.studentId)
          .in("subject_id", subjectIds)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("presences")
          .select("status, date")
          .eq("student_id", student.studentId)
          .in("subject_id", subjectIds)
          .limit(2000),
      ]);
      if (notesRes.error) throw notesRes.error;
      if (presRes.error) throw presRes.error;
      return {
        notes: (notesRes.data ?? []) as unknown as {
          id: string;
          score: number;
          max_score: number;
          is_absent: boolean;
          period_label: string;
          created_at: string;
          evaluations: { title: string; type: EvaluationType; eval_date: string | null } | null;
        }[],
        presences: (presRes.data ?? []) as { status: string; date: string }[],
      };
    },
  });

  const graded = (data?.notes ?? []).filter((n) => !n.is_absent && Number(n.max_score) > 0);
  // simple average on 20 over all grades in the subject (the bulletin uses coefficients across subjects)
  const avg = graded.length ? graded.reduce((t, n) => t + (Number(n.score) / Number(n.max_score)) * 20, 0) / graded.length : null;
  const absences = (data?.presences ?? []).filter((p) => p.status === "absent").length;
  const lates = (data?.presences ?? []).filter((p) => p.status === "late").length;
  const excused = (data?.presences ?? []).filter((p) => p.status === "excused").length;
  const lessons = data?.presences.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-100 p-5 dark:border-[var(--border)]">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm font-bold text-brand-800">
            {initialsOf(student.firstName, student.lastName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900 dark:text-slate-50">{fullName(student.firstName, student.lastName)}</p>
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <ClassColorDot id={student.classId} name={student.className} />
              {student.className} · {subjects.map((s) => s.name).join(", ")}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-slate-50 px-1 py-2 dark:bg-[var(--surface-2)]">
            <dd className={cn("text-xl font-bold tabular-nums", avg == null ? "text-slate-400" : avg < 10 ? "text-rose-600" : "text-slate-900 dark:text-slate-50")}>
              {avg == null ? "—" : fmt(Math.round(avg * 10) / 10)}
            </dd>
            <dt className="text-[11px] text-slate-500">moyenne /20</dt>
          </div>
          <div className="rounded-md bg-slate-50 px-1 py-2 dark:bg-[var(--surface-2)]">
            <dd className={cn("text-xl font-bold tabular-nums", absences ? "text-rose-600" : "text-slate-900 dark:text-slate-50")}>{absences}</dd>
            <dt className="text-[11px] text-slate-500">absence{absences > 1 ? "s" : ""}</dt>
          </div>
          <div className="rounded-md bg-slate-50 px-1 py-2 dark:bg-[var(--surface-2)]">
            <dd className={cn("text-xl font-bold tabular-nums", lates ? "text-amber-600" : "text-slate-900 dark:text-slate-50")}>{lates}</dd>
            <dt className="text-[11px] text-slate-500">retard{lates > 1 ? "s" : ""}</dt>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-slate-500">
          {lessons} cours enregistré{lessons > 1 ? "s" : ""}
          {excused ? ` · ${excused} absence${excused > 1 ? "s" : ""} justifiée${excused > 1 ? "s" : ""}` : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Dernières notes</p>
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (data?.notes.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">Aucune note pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-[var(--border)]">
            {data!.notes.slice(0, 8).map((n) => {
              const on20 = n.is_absent || !Number(n.max_score) ? null : (Number(n.score) / Number(n.max_score)) * 20;
              return (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {n.evaluations?.title ?? "Note"}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {n.evaluations?.type ? evaluationTypeLabel(n.evaluations.type) : ""} · {n.period_label} ·{" "}
                      {format(new Date(n.evaluations?.eval_date ? `${n.evaluations.eval_date}T12:00:00` : n.created_at), "d MMM", { locale: fr })}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold tabular-nums",
                      on20 == null ? "text-slate-400" : on20 < 10 ? "text-rose-600" : "text-slate-900 dark:text-slate-50",
                    )}
                  >
                    {n.is_absent ? "Absent" : `${fmt(Number(n.score))}/${fmt(Number(n.max_score))}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 p-3 dark:border-[var(--border)]">
        <Link
          to={`/classes/${student.classId}/notes`}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand-700 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <NotebookPen className="h-4 w-4" />
          Notes
        </Link>
        <Link
          to={`/classes/${student.classId}/presences`}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-[var(--border)] dark:text-slate-200"
        >
          <ClipboardCheck className="h-4 w-4" />
          Présences
        </Link>
      </div>
    </div>
  );
}
