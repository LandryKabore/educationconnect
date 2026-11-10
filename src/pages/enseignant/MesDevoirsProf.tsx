import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ClipboardList, FileText, Plus } from "lucide-react";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatDateSafe } from "@/lib/dateFr";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import type { EvaluationType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type NextExam = {
  title: string;
  eval_date: string | null;
  admin_confirmed: boolean;
};

type ClassTravauxRow = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  total: number;
  ungraded: number;
  byType: Record<EvaluationType, number>;
  nextExam: NextExam | null;
  /** Subject/period of first item still to grade — so “Ouvrir la classe” lands on the right filters. */
  focusSubjectId: string | null;
  focusPeriod: string | null;
};

type UngradedEval = {
  id: string;
  title: string;
  classId: string;
  className: string;
  subjectName: string;
  createdAt: string;
  noted: number;
  roster: number;
};

type DevoirsData = {
  classes: ClassTravauxRow[];
  queue: UngradedEval[];
};

const EMPTY_BY_TYPE: Record<EvaluationType, number> = {
  interrogation: 0,
  devoir: 0,
  composition: 0,
  examen: 0,
};

const EMPTY_DATA: DevoirsData = { classes: [], queue: [] };

function classNotesPath(classId: string, subjectId?: string | null) {
  const params = new URLSearchParams({ from: "devoirs" });
  if (subjectId) params.set("subject", subjectId);
  return `/classes/${classId}/notes?${params.toString()}`;
}

function createEvalPath(classId: string) {
  return `/classes/${classId}/notes?from=devoirs&nouveau=1`;
}

function gradePath(classId: string, evalId: string) {
  return `/classes/${classId}/notes/${evalId}?from=devoirs`;
}

function ageLabel(iso: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(iso));
  if (Number.isNaN(days) || days <= 0) return "aujourd’hui";
  if (days === 1) return "il y a 1 jour";
  return `il y a ${days} jours`;
}

function embedName(raw: unknown): string {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (
    row &&
    typeof row === "object" &&
    "name" in row &&
    typeof (row as { name: unknown }).name === "string"
  ) {
    return (row as { name: string }).name;
  }
  return "Matière";
}

export default function MesDevoirsProf() {
  const { user } = useAuth();
  const [showAllQueue, setShowAllQueue] = useState(false);

  const { data = EMPTY_DATA, isLoading } = useQuery({
    queryKey: ["teacher-mes-devoirs", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<DevoirsData> => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, classes(id, name, grade_level)")
        .eq("teacher_id", user!.id);
      if (error) throw error;

      const byClass = new Map<
        string,
        { classId: string; className: string; gradeLevel: string | null }
      >();
      for (const row of aff ?? []) {
        const r = row as unknown as {
          class_section_id: string;
          classes: { id: string; name: string; grade_level: string | null } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        if (!byClass.has(classId)) {
          byClass.set(classId, {
            classId,
            className: r.classes?.name ?? "Classe",
            gradeLevel: r.classes?.grade_level ?? null,
          });
        }
      }

      const list = [...byClass.values()];
      const sorted = sortClassesByProgression(
        list.map((c) => ({ id: c.classId, name: c.className, grade_level: c.gradeLevel })),
      );
      const ordered = sorted
        .map((s) => list.find((c) => c.classId === s.id)!)
        .filter(Boolean);

      if (ordered.length === 0) return EMPTY_DATA;
      const classIds = ordered.map((c) => c.classId);

      const { data: evals, error: evalError } = await supabase
        .from("evaluations")
        .select(
          "id, class_section_id, subject_id, period_label, type, eval_date, title, admin_confirmed, created_at, matieres(name)",
        )
        .eq("teacher_id", user!.id)
        .in("class_section_id", classIds);
      if (evalError) throw evalError;

      const rows = (evals ?? []) as unknown as {
        id: string;
        class_section_id: string;
        subject_id: string;
        period_label: string;
        type: EvaluationType;
        eval_date: string | null;
        title: string;
        admin_confirmed: boolean;
        created_at: string;
        matieres: unknown;
      }[];

      const gradedCounts = new Map<string, number>();
      const evalIds = rows.map((r) => r.id);
      if (evalIds.length > 0) {
        const { data: notes } = await supabase
          .from("notes")
          .select("evaluation_id")
          .in("evaluation_id", evalIds);
        for (const n of notes ?? []) {
          const eid = (n as { evaluation_id: string | null }).evaluation_id;
          if (eid) gradedCounts.set(eid, (gradedCounts.get(eid) ?? 0) + 1);
        }
      }

      const rosterByClass = new Map<string, number>();
      const { data: insc } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .in("class_section_id", classIds)
        .eq("status", "active");
      for (const row of insc ?? []) {
        const cid = (row as { class_section_id: string }).class_section_id;
        rosterByClass.set(cid, (rosterByClass.get(cid) ?? 0) + 1);
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const queue: UngradedEval[] = [];

      const classes = ordered.map((c): ClassTravauxRow => {
        const classEvals = rows.filter((r) => r.class_section_id === c.classId);
        const byType = { ...EMPTY_BY_TYPE };
        let ungraded = 0;
        const ungradedList: typeof classEvals = [];
        const roster = rosterByClass.get(c.classId) ?? 0;
        for (const ev of classEvals) {
          byType[ev.type] += 1;
          const noted = gradedCounts.get(ev.id) ?? 0;
          // Still "à noter" until every student in the class has a grade.
          if (roster === 0 || noted < roster) {
            ungraded += 1;
            ungradedList.push(ev);
            queue.push({
              id: ev.id,
              title: ev.title,
              classId: c.classId,
              className: c.className,
              subjectName: embedName(ev.matieres),
              createdAt: ev.created_at,
              noted,
              roster,
            });
          }
        }
        // Prefer oldest ungraded so the class link lands on work waiting longest.
        ungradedList.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const focus = ungradedList[0] ?? classEvals[0] ?? null;
        const nextExam = classEvals
          .filter((ev) => ev.type === "examen" && ev.eval_date && ev.eval_date >= todayIso)
          .sort((a, b) => (a.eval_date! < b.eval_date! ? -1 : 1))[0];

        return {
          classId: c.classId,
          className: c.className,
          gradeLevel: c.gradeLevel,
          total: classEvals.length,
          ungraded,
          byType,
          focusSubjectId: focus?.subject_id ?? null,
          focusPeriod: focus?.period_label ?? null,
          nextExam: nextExam
            ? {
                title: nextExam.title,
                eval_date: nextExam.eval_date,
                admin_confirmed: nextExam.admin_confirmed,
              }
            : null,
        };
      });

      queue.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return { classes, queue };
    },
  });

  const classes = data.classes;
  const queue = data.queue;
  const visibleQueue = showAllQueue ? queue : queue.slice(0, 3);
  const hiddenCount = Math.max(0, queue.length - 3);

  return (
    <div>
      <PageHeader
        title="Devoirs & évaluations"
        subtitle="Interrogations et devoirs à rendre — par classe"
        actions={
          classes.length > 0 ? (
            <NewEvaluationButton
              classes={classes.map((c) => ({
                classId: c.classId,
                className: c.className,
              }))}
            />
          ) : null
        }
      />

      {isLoading ? (
        <QueueSkeleton />
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <>
          {queue.length > 0 ? (
            <section
              className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800/60 dark:bg-amber-950/20"
              aria-label="À noter en priorité"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  À noter en priorité
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  les plus anciennes d’abord
                </p>
              </div>
              <ul className="space-y-2">
                {visibleQueue.map((item) => (
                  <QueueRow key={item.id} item={item} />
                ))}
              </ul>
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  aria-expanded={showAllQueue}
                  onClick={() => setShowAllQueue((open) => !open)}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
                >
                  {showAllQueue
                    ? "Masquer"
                    : `Voir les ${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}`}
                  <ChevronDown
                    className={cn("h-4 w-4 transition", showAllQueue && "rotate-180")}
                    aria-hidden
                  />
                </button>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c) => (
              <Card
                key={c.classId}
                className="flex h-full flex-col border border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
                      {c.className}
                    </h2>
                    {c.gradeLevel ? (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {c.gradeLevel}
                      </p>
                    ) : null}
                  </div>
                  {c.ungraded > 0 ? (
                    <Badge tone="warning">{c.ungraded} à noter</Badge>
                  ) : null}
                </div>

                {c.total === 0 ? (
                  <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                    Aucune évaluation pour le moment
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(Object.keys(c.byType) as EvaluationType[])
                      .filter((t) => c.byType[t] > 0)
                      .map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {c.byType[t]} {evaluationTypeLabel(t).toLowerCase()}
                          {c.byType[t] > 1 ? "s" : ""}
                        </span>
                      ))}
                  </div>
                )}

                {c.nextExam ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {c.nextExam.title}
                      {c.nextExam.eval_date
                        ? ` · ${formatDateSafe(c.nextExam.eval_date, "d MMM", { locale: fr })}`
                        : ""}
                    </span>
                    <Badge tone={c.nextExam.admin_confirmed ? "success" : "warning"}>
                      {c.nextExam.admin_confirmed ? "Confirmé" : "En attente"}
                    </Badge>
                  </p>
                ) : null}

                {c.total === 0 ? (
                  <Link
                    to={createEvalPath(c.classId)}
                    className="mt-4 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
                  >
                    + Créer la première
                  </Link>
                ) : (
                  <Link
                    to={classNotesPath(c.classId, c.focusSubjectId)}
                    className="mt-4 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
                  >
                    Ouvrir la classe →
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function QueueRow({ item }: { item: UngradedEval }) {
  const ratio =
    item.roster > 0
      ? `${item.noted}/${item.roster} notes`
      : "Aucun élève inscrit";
  const pct =
    item.roster > 0 ? Math.min(100, Math.round((item.noted / item.roster) * 100)) : 0;
  const spoken =
    item.roster > 0
      ? `${item.noted} notes sur ${item.roster} pour ${item.title}`
      : `${item.title}, aucun élève inscrit`;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-amber-100 bg-white px-3 py-3 dark:border-amber-900/40 dark:bg-[var(--surface)]">
      <span className="h-10 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
          {item.title}
          <span className="font-normal text-slate-600 dark:text-slate-300">
            {" "}
            · {item.className} · {item.subjectName}
          </span>
        </p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
          {ageLabel(item.createdAt)} · {ratio}
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.max(item.roster, 1)}
          aria-valuenow={item.noted}
          aria-label={spoken}
          aria-valuetext={spoken}
        >
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Link
        to={gradePath(item.classId, item.id)}
        className="inline-flex h-10 shrink-0 items-center rounded-xl bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Saisir
      </Link>
    </li>
  );
}

function NewEvaluationButton({
  classes,
}: {
  classes: { classId: string; className: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const buttonClass =
    "inline-flex h-10 items-center gap-1.5 rounded-full border border-brand-600 px-3 text-sm font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-200 dark:hover:bg-brand-900/30";

  if (classes.length === 1) {
    return (
      <Link to={createEvalPath(classes[0]!.classId)} className={buttonClass}>
        <Plus className="h-4 w-4" aria-hidden />
        Nouvelle évaluation
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={buttonClass}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Nouvelle évaluation
      </button>
      {open ? (
        <ul
          role="menu"
          aria-label="Choisir une classe"
          className="absolute right-0 z-20 mt-1 min-w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-[var(--surface)]"
        >
          {classes.map((c) => (
            <li key={c.classId} role="none">
              <Link
                role="menuitem"
                to={createEvalPath(c.classId)}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-100 dark:hover:bg-[var(--surface-2)]"
              >
                {c.className}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="sr-only">Chargement des évaluations…</p>
      <div className="h-40 animate-pulse rounded-2xl bg-amber-100/80 dark:bg-amber-950/30" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700"
          />
        ))}
      </div>
    </div>
  );
}
