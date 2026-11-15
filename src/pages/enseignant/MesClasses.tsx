import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, ClipboardCheck, GraduationCap, TrendingDown, Users } from "lucide-react";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatAverage } from "@/lib/averages";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PageBanner } from "@/components/PageBanner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchTeacherClassStats } from "@/lib/scaleApi";

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
        const r = row as unknown as {
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

      // Student counts and grade averages are computed in SQL (the old page downloaded
      // every grade of every class, which stops at 1,000 rows and gave wrong averages).
      const stats =
        classIds.length > 0
          ? await fetchTeacherClassStats(classIds)
          : { counts: {} as Record<string, number>, averages: [] };
      const counts = new Map<string, number>(Object.entries(stats.counts));
      const avgByKey = new Map(
        stats.averages.map((a) => [`${a.classId}|${a.subjectId}`, a]),
      );

      return ordered.map((c): TeacherClass => {
        const subjects: SubjectAvg[] = [...c.subjects.entries()]
          .map(([subjectId, subjectName]) => {
            const a = avgByKey.get(`${c.classId}|${subjectId}`);
            return {
              subjectId,
              subjectName,
              averageOn20: a ? Number(a.avg) : null,
              gradeCount: a ? Number(a.n) : 0,
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
  const allAverages = classes.flatMap((c) => c.subjects.filter((s) => s.averageOn20 != null));
  const overall =
    allAverages.length > 0
      ? allAverages.reduce((n, s) => n + (s.averageOn20 ?? 0), 0) / allAverages.length
      : null;
  const below = classes.filter((c) => {
    const a = classAverage(c);
    return a != null && a < 10;
  });
  const weakest = [...classes]
    .filter((c) => classAverage(c) != null)
    .sort((a, b) => (classAverage(a) ?? 0) - (classAverage(b) ?? 0))[0];

  return (
    <div>
      <PageBanner
        title="Mes classes"
        subtitle="Les classes où vous enseignez, avec la moyenne de classe dans votre matière."
        stats={[
          { label: "Classes", value: String(classes.length), hint: "cette année" },
          { label: "Élèves", value: String(totalStudents), hint: "au total" },
          {
            label: "Moyenne",
            value: overall != null ? `${formatAverage(overall)}/20` : "—",
            hint: below.length ? `${below.length} classe${below.length > 1 ? "s" : ""} sous 10` : "toutes classes",
          },
        ]}
        aside={
          weakest ? (
            <Link
              to={`/classes/${weakest.classId}`}
              className="block rounded-md bg-[#fff] p-4 text-slate-900 shadow-sm transition hover:shadow-md dark:bg-[var(--surface)] dark:text-slate-100"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <TrendingDown className="h-3.5 w-3.5" />
                Classe à suivre
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold">{weakest.className}</p>
                  <p className="text-xs text-slate-500">la moyenne la plus basse de vos classes</p>
                </div>
                <p className={cn("shrink-0 text-2xl font-bold tabular-nums", avgTone(classAverage(weakest)).text)}>
                  {formatAverage(classAverage(weakest)!)}
                  <span className="text-sm font-semibold text-slate-400">/20</span>
                </p>
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-300">
                Ouvrir la classe <ChevronRight className="h-4 w-4" />
              </p>
            </Link>
          ) : undefined
        }
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const avg = classAverage(c);
            const tone = avgTone(avg);
            return (
              <article
                key={c.classId}
                className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white transition hover:border-brand-300 hover:shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)] dark:hover:border-brand-700"
              >
                <Link
                  to={`/classes/${c.classId}`}
                  className="flex flex-1 flex-col outline-none ring-inset ring-brand-500 focus-visible:ring-2"
                >
                  <div className={cn("h-1", tone.bar)} />
                  <div className="flex items-start gap-3 px-4 pt-4">
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand-50 font-bold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200",
                        shortName(c.className).length > 2 ? "text-xs" : "text-sm",
                      )}
                    >
                      {shortName(c.className)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">
                        {c.className}
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Users className="h-3 w-3 shrink-0" />
                        {c.studentCount} élève{c.studentCount > 1 ? "s" : ""}
                        {c.gradeLevel && c.gradeLevel !== c.className ? ` · ${c.gradeLevel}` : ""}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-bold", tone.chip)}>
                      {tone.label}
                    </span>
                  </div>

                  <div className="flex-1 space-y-3 px-4 pb-4 pt-4">
                    {c.subjects.map((s) => {
                      const t = avgTone(s.averageOn20);
                      return (
                        <div key={s.subjectId}>
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{s.subjectName}</p>
                            <p className={cn("shrink-0 text-xl font-bold tabular-nums leading-none", t.text)}>
                              {s.averageOn20 != null ? formatAverage(s.averageOn20) : "—"}
                              <span className="text-xs font-semibold text-slate-400">/20</span>
                            </p>
                          </div>
                          <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className={cn("h-full rounded-full", t.bar)} style={{ width: scoreBarWidth(s.averageOn20) }} />
                            <span className="absolute inset-y-0 left-1/2 w-px bg-slate-400/60" title="10/20" />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {s.gradeCount > 0
                              ? `Moyenne de classe · ${s.gradeCount} note${s.gradeCount > 1 ? "s" : ""}`
                              : "Aucune note encore"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Link>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3 dark:border-[var(--border)]">
                  <FooterLink to={`/devoirs?classe=${c.classId}`} icon={<BookOpen className="h-4 w-4" />} label="Évaluations" />
                  <FooterLink
                    to={`/classes/${c.classId}/presences`}
                    icon={<ClipboardCheck className="h-4 w-4" />}
                    label="Appel"
                  />
                  <FooterLink to={`/mes-eleves?classe=${c.classId}`} icon={<GraduationCap className="h-4 w-4" />} label="Élèves" />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FooterLink({ to, icon, label, className }: { to: string; icon: React.ReactNode; label: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md bg-brand-700 px-2 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800",
        className,
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

/** Average over the teacher's subjects in the class (null without grades). */
function classAverage(c: TeacherClass): number | null {
  const graded = c.subjects.filter((s) => s.averageOn20 != null);
  if (!graded.length) return null;
  return graded.reduce((n, s) => n + (s.averageOn20 ?? 0), 0) / graded.length;
}

function avgTone(avg: number | null) {
  if (avg == null)
    return { label: "Pas de notes", text: "text-slate-400", bar: "bg-slate-200 dark:bg-slate-700", chip: "bg-slate-100 text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300" };
  if (avg >= 12)
    return { label: "Bon niveau", text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" };
  if (avg >= 10)
    return { label: "Moyen", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-400", chip: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" };
  return { label: "En difficulté", text: "text-rose-700 dark:text-rose-400", bar: "bg-rose-500", chip: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300" };
}

/** « Terminale A » → « TA », « 6ème A » → « 6A » */
function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 3);
  const first = /^\d/.test(parts[0]!) ? parts[0]!.replace(/\D.*$/, "") : parts[0]!.slice(0, parts[0]!.length <= 3 ? 3 : 1);
  return `${first}${parts[parts.length - 1]!.slice(0, 2)}`;
}
