import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  NotebookPen,
  Plus,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { iso, lessonHours, lessonPath, useTeacherLessons, useTeacherSlots, type JobState } from "@/hooks/useTeacherLessons";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import { supabase } from "@/lib/supabase";
import type { EvaluationType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/weekGrid";
import { RollCall } from "@/components/RollCall";
import { CahierLessonForm } from "@/components/CahierLessonForm";
import { Card, EmptyState } from "@/components/ui";

type Tab = "appel" | "cahier" | "travail";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Lesson workspace: everything for ONE lesson (timetable slot on a date) in one place —
 * the roll call, the cahier de textes, and the work / grades of this class and subject.
 */
export default function EspaceCours() {
  const { slotId } = useParams<{ slotId: string }>();
  const [params, setParams] = useSearchParams();
  const now = useNow(60_000);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : iso(now);
  const tab = (["appel", "cahier", "travail"].includes(params.get("onglet") ?? "") ? params.get("onglet") : "appel") as Tab;
  const setTab = (t: Tab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("onglet", t);
        return p;
      },
      { replace: true },
    );

  const slotsQ = useTeacherSlots();
  const { lessons } = useTeacherLessons(now);
  const slot = slotsQ.data?.find((s) => s.id === slotId);
  const lesson = lessons.find((l) => l.slotId === slotId && l.date === date);
  // the other lessons of the same day, for « previous / next »
  const sameDay = useMemo(
    () => lessons.filter((l) => l.date === date).sort((a, b) => a.start.localeCompare(b.start)),
    [lessons, date],
  );
  const pos = sameDay.findIndex((l) => l.slotId === slotId);
  const prev = pos > 0 ? sameDay[pos - 1] : null;
  const next = pos >= 0 && pos < sameDay.length - 1 ? sameDay[pos + 1] : null;

  if (slotsQ.isLoading) return <p className="text-slate-500">Chargement…</p>;
  if (!slot) return <EmptyState message="Ce cours n’est pas dans votre emploi du temps." />;

  const subjectName = slot.matieres?.name ?? "Cours";
  const className = slot.classes?.name ?? "Classe";
  const dayLabel = capitalize(format(new Date(`${date}T12:00:00`), "EEEE d MMMM", { locale: fr }));
  const appel: JobState = lesson?.appel ?? "todo";
  const cahier: JobState = lesson?.cahier ?? "todo";
  const timing = lesson?.timing ?? (date > iso(now) ? "upcoming" : "over");

  return (
    <div className="space-y-6">
      <Link to="/tableau-de-bord" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
        <ArrowLeft className="h-4 w-4" />
        Ma journée
      </Link>

      {/* Banner: the lesson */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/[0.06]" />
        <div className="relative flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
              {dayLabel} · {timing === "live" ? "En cours" : timing === "upcoming" ? "À venir" : "Terminé"}
            </p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
              {subjectName} · {className}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-white/85">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {lessonHours({ start: slot.start_time, end: slot.end_time })}
              </span>
              {slot.room ? <span>Salle {slot.room.replace(/^salle\s*/i, "")}</span> : null}
              {lesson ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {lesson.studentCount} élèves
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {prev ? (
              <Link
                to={lessonPath(prev, tab)}
                className="inline-flex h-10 items-center gap-1 rounded-md bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                <ChevronLeft className="h-4 w-4" />
                {prev.className}
              </Link>
            ) : null}
            {next ? (
              <Link
                to={lessonPath(next, tab)}
                className="inline-flex h-10 items-center gap-1 rounded-md bg-white/10 px-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20"
              >
                {next.className}
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      {/* Steps of the lesson */}
      <nav aria-label="Étapes du cours" className="grid gap-2 sm:grid-cols-3">
        <StepTab
          n={1}
          icon={ClipboardCheck}
          title="Appel"
          state={appel}
          detail={
            appel === "done"
              ? `${lesson?.absent ?? 0} absent${(lesson?.absent ?? 0) > 1 ? "s" : ""} · ${lesson?.late ?? 0} retard${(lesson?.late ?? 0) > 1 ? "s" : ""}`
              : appel === "partial"
                ? "Commencé, pas validé"
                : "À faire"
          }
          active={tab === "appel"}
          onClick={() => setTab("appel")}
        />
        <StepTab
          n={2}
          icon={BookOpenCheck}
          title="Cahier de textes"
          state={cahier}
          detail={cahier === "done" ? "Rempli" : "À remplir"}
          active={tab === "cahier"}
          onClick={() => setTab("cahier")}
        />
        <StepTab
          n={3}
          icon={NotebookPen}
          title="Travail & notes"
          state={null}
          detail="Évaluations de la classe"
          active={tab === "travail"}
          onClick={() => setTab("travail")}
        />
      </nav>

      {tab === "appel" ? (
        <div className="pb-28 lg:pb-0">
          {timing === "upcoming" ? (
            <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100">
              Ce cours n’a pas encore commencé. Vous pouvez quand même préparer l’appel.
            </p>
          ) : null}
          <RollCall
            classId={slot.class_section_id}
            subjectId={slot.subject_id}
            date={date}
            onSaved={() => {
              if (cahier !== "done") setTab("cahier");
            }}
          />
        </div>
      ) : tab === "cahier" ? (
        <Card className="max-w-3xl">
          <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-slate-50">Cahier de textes</h2>
          <p className="mb-5 text-sm text-slate-500">
            Ce qui a été fait et le travail à faire. Les élèves de {className} et leurs parents le voient aussitôt.
          </p>
          <CahierLessonForm
            slotId={slot.id}
            classId={slot.class_section_id}
            subjectId={slot.subject_id}
            date={date}
          />
        </Card>
      ) : (
        <WorkTab classId={slot.class_section_id} subjectId={slot.subject_id} studentCount={lesson?.studentCount ?? 0} />
      )}
    </div>
  );
}

function StepTab({
  n,
  icon: Icon,
  title,
  state,
  detail,
  active,
  onClick,
}: {
  n: number;
  icon: typeof Clock;
  title: string;
  state: JobState | null;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  const done = state === "done";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white p-3.5 text-left transition dark:bg-[var(--surface)]",
        active
          ? "border-brand-600 ring-2 ring-brand-600/20"
          : "border-slate-200 hover:border-brand-300 dark:border-[var(--border)]",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold",
          done
            ? "bg-emerald-600 text-white"
            : active
              ? "bg-brand-700 text-white"
              : "bg-slate-100 text-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-300",
        )}
      >
        {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Étape {n}</span>
        <span className="block truncate font-bold text-slate-900 dark:text-slate-50">{title}</span>
        <span
          className={cn(
            "block truncate text-xs",
            state === "done" ? "text-emerald-700" : state === null ? "text-slate-500" : "text-amber-700",
          )}
        >
          {detail}
        </span>
      </span>
    </button>
  );
}

/** Evaluations of this class and subject, with how many grades are in. */
function WorkTab({ classId, subjectId, studentCount }: { classId: string; subjectId: string; studentCount: number }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["lesson-evaluations", classId, subjectId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: evals, error } = await supabase
        .from("evaluations")
        .select("id, title, type, eval_date, admin_confirmed, period_label")
        .eq("class_section_id", classId)
        .eq("subject_id", subjectId)
        .order("eval_date", { ascending: false, nullsFirst: false })
        .limit(12);
      if (error) throw error;
      const list = (evals ?? []) as {
        id: string;
        title: string;
        type: EvaluationType;
        eval_date: string | null;
        admin_confirmed: boolean | null;
        period_label: string;
      }[];
      const counts: Record<string, number> = {};
      if (list.length) {
        const { data: notes } = await supabase
          .from("notes")
          .select("evaluation_id")
          .in("evaluation_id", list.map((e) => e.id))
          .limit(5000);
        for (const n of (notes ?? []) as { evaluation_id: string }[]) counts[n.evaluation_id] = (counts[n.evaluation_id] ?? 0) + 1;
      }
      return list.map((e) => ({ ...e, graded: counts[e.id] ?? 0 }));
    },
  });

  const newPath = `/devoirs?classe=${classId}&matiere=${subjectId}&nouveau=interrogation`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Travail & notes</h2>
          <p className="text-sm text-slate-500">Les évaluations de cette classe dans votre matière.</p>
        </div>
        <Link
          to={newPath}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" />
          Interrogation ou exercice
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : !data || data.length === 0 ? (
        <EmptyState message="Aucune évaluation pour le moment dans cette classe." />
      ) : (
        <Card className="divide-y divide-slate-100 p-0 dark:divide-[var(--border)]">
          {data.map((e) => {
            const pct = studentCount ? Math.min(100, Math.round((e.graded / studentCount) * 100)) : 0;
            const complete = studentCount > 0 && e.graded >= studentCount;
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {evaluationTypeLabel(e.type)} · {e.period_label}
                    {e.eval_date ? ` · ${format(new Date(`${e.eval_date}T12:00:00`), "d MMM yyyy", { locale: fr })}` : ""}
                    {e.type === "examen" && !e.admin_confirmed ? " · en attente de confirmation" : ""}
                  </p>
                </div>
                <div className="w-40">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className={complete ? "text-emerald-700" : "text-slate-600"}>
                      {e.graded}/{studentCount} notes
                    </span>
                    <span className="text-slate-400">{pct} %</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-slate-100 dark:bg-[var(--surface-2)]">
                    <div className={cn("h-full rounded-sm", complete ? "bg-emerald-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <Link
                  to={`/classes/${classId}/notes/${e.id}`}
                  className={cn(
                    "inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition",
                    complete
                      ? "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[var(--border)] dark:text-slate-200"
                      : "bg-brand-700 text-white hover:bg-brand-800",
                  )}
                >
                  {complete ? "Voir les notes" : "Saisir les notes"}
                </Link>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
