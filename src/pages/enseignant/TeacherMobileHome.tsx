import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";
import {
  appelBadge,
  attendanceHref,
  formatHm,
  formatSlotRange,
  homeworkHref,
  notesHref,
  nowMeta,
  rollCallLabel,
  slotTitle,
  type AppelStatus,
  type MobileScheduleView,
  type NowEmptyKind,
  type SlotView,
} from "@/lib/teacherNow";
import { cn } from "@/lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[var(--bg)]";

export type MetricChipModel = {
  key: string;
  to: string;
  value: string;
  label: string;
  valueClass: string;
  ariaLabel: string;
};

function appelTone(
  status: AppelStatus,
): "success" | "warning" | "info" | "default" {
  if (status === "done") return "success";
  if (status === "partial") return "info";
  if (status === "empty") return "default";
  return "warning";
}

function emptyCopy(
  kind: NowEmptyKind,
  nextDayLabel: string | null,
): { title: string; body: string } {
  switch (kind) {
    case "sunday":
      return {
        title: "Pas de cours le dimanche",
        body: "L’école reprend lundi. L’emploi du temps de la semaine reste disponible.",
      };
    case "no-timetable":
      return {
        title: "Aucun emploi du temps",
        body: "Aucun cours n’est planifié pour le moment.",
      };
    case "no-class-today":
      return {
        title: "Pas de cours aujourd’hui",
        body: nextDayLabel
          ? `Prochain cours : ${nextDayLabel.toLowerCase()}.`
          : "Rien au programme pour cette journée.",
      };
    default:
      return {
        title: "Plus de cours aujourd’hui",
        body: "Tous les créneaux du jour sont passés. Les appels restants sont listés plus bas.",
      };
  }
}

function TimetableLink() {
  return (
    <Link
      to="/mon-emploi-du-temps"
      className={cn(
        "inline-flex min-h-11 items-center rounded-lg text-sm font-semibold underline-offset-2 hover:underline",
        focusRing,
      )}
    >
      <span className="text-brand-800 dark:text-brand-200">Voir l’emploi du temps</span>
    </Link>
  );
}

function NowSkeleton() {
  return (
    <div
      className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700"
      role="status"
      aria-label="Chargement du cours en cours"
    />
  );
}

function EmptyNow({
  kind,
  nextDayLabel,
}: {
  kind: NowEmptyKind;
  nextDayLabel: string | null;
}) {
  const copy = emptyCopy(kind, nextDayLabel);
  return (
    <section
      aria-labelledby="maintenant-empty-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
        Maintenant
      </p>
      <h2
        id="maintenant-empty-title"
        className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100"
      >
        {copy.title}
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{copy.body}</p>
      <div className="mt-2">
        <TimetableLink />
      </div>
    </section>
  );
}

function NowCard({ view, todayIso }: { view: SlotView; todayIso: string }) {
  const { slot } = view;
  const title = slotTitle(slot);
  const range = formatSlotRange(slot.start_time, slot.end_time);
  const kindLabel = view.kind === "current" ? "En cours" : "Prochain";
  const classId = slot.classId;

  return (
    <section
      aria-labelledby="maintenant-title"
      className="rounded-2xl border-2 border-brand-700 bg-brand-50 p-4 dark:border-brand-400 dark:bg-brand-900/30"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-800 dark:text-brand-100">
        {kindLabel}
        {range ? ` · ${range}` : ""}
      </p>
      <h2
        id="maintenant-title"
        className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-slate-50"
      >
        <span className="sr-only">Maintenant. </span>
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
        {nowMeta({
          room: slot.room,
          studentCount: view.studentCount,
          appel: view.appel,
        })}
      </p>
      {classId ? (
        <div className="mt-4 space-y-2">
          <Link
            to={attendanceHref(classId, slot.subjectId, todayIso)}
            className={cn(
              "flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-700 px-4 py-3 text-center text-base font-semibold leading-snug transition hover:bg-brand-800",
              focusRing,
            )}
          >
            {/* Color sits on the span: global `a { color: inherit }` overrides utilities on the link. */}
            <span className="text-white">{rollCallLabel(slot.className)}</span>
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to={notesHref(classId, slot.subjectId)}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-xl border-2 border-brand-700 bg-white px-2 py-2 text-center text-sm font-semibold leading-snug transition hover:bg-brand-100 dark:border-brand-300 dark:bg-transparent dark:hover:bg-brand-900/50",
                focusRing,
              )}
            >
              <span className="text-brand-800 dark:text-brand-100">Saisir des notes</span>
            </Link>
            <Link
              to={homeworkHref(classId, slot.subjectId)}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-xl border-2 border-brand-700 bg-white px-2 py-2 text-center text-sm font-semibold leading-snug transition hover:bg-brand-100 dark:border-brand-300 dark:bg-transparent dark:hover:bg-brand-900/50",
                focusRing,
              )}
            >
              <span className="text-brand-800 dark:text-brand-100">Donner un devoir</span>
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Ce créneau n’est pas relié à une classe.
        </p>
      )}
    </section>
  );
}

function ensuiteLabel(view: SlotView): string {
  const time = formatHm(view.slot.start_time);
  const parts = [time, view.slot.subjectName, view.slot.className].filter(Boolean);
  return parts.join(" · ") || "Cours";
}

function EnsuiteList({
  rest,
  todayIso,
  dayFinished,
}: {
  rest: SlotView[];
  todayIso: string;
  dayFinished: boolean;
}) {
  return (
    <section
      aria-labelledby="ensuite-heading"
      className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="ensuite-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Ensuite aujourd’hui
          </h2>
          {dayFinished ? (
            <p className="text-xs text-slate-500 dark:text-slate-300">
              Créneaux déjà passés
            </p>
          ) : null}
        </div>
        <Link
          to="/mon-emploi-du-temps"
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-lg px-1 text-sm font-semibold",
            focusRing,
          )}
        >
          <span className="text-brand-800 dark:text-brand-200">Emploi du temps</span>
        </Link>
      </div>
      {rest.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Aucun autre cours aujourd’hui.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
          {rest.map((view) => {
            const label = ensuiteLabel(view);
            const room = view.slot.room?.trim();
            const badge = (
              <Badge tone={appelTone(view.appel)}>{appelBadge(view.appel)}</Badge>
            );
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {label}
                  </span>
                  {room ? (
                    <span className="block text-xs text-slate-600 dark:text-slate-300">
                      Salle {room}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0">{badge}</span>
              </>
            );
            const classId = view.slot.classId;
            return (
              <li key={view.slot.id}>
                {classId ? (
                  <Link
                    to={attendanceHref(classId, view.slot.subjectId, todayIso)}
                    aria-label={`${label}, ${appelBadge(view.appel)}`}
                    className={cn(
                      "flex min-h-11 items-center justify-between gap-3 rounded-xl py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/40",
                      focusRing,
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-11 items-center justify-between gap-3 py-2">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TeacherMetricStrip({ chips }: { chips: MetricChipModel[] }) {
  return (
    <nav aria-label="Indicateurs" className="min-w-0">
      <ul className="flex max-w-full list-none gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => (
          <li key={chip.key} className="shrink-0">
            <Link
              to={chip.to}
              aria-label={chip.ariaLabel}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-brand-300 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-slate-100",
                focusRing,
              )}
            >
              <span className={cn("font-bold tabular-nums", chip.valueClass)}>
                {chip.value}
              </span>
              <span>{chip.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TeacherMobileHome({
  schedule,
  chips,
  todayIso,
  edtLoading,
  edtError,
}: {
  schedule: MobileScheduleView | null;
  chips: MetricChipModel[];
  todayIso: string;
  edtLoading: boolean;
  edtError: boolean;
}) {
  const showEnsuite =
    !edtLoading &&
    !edtError &&
    schedule != null &&
    schedule.empty !== "sunday" &&
    schedule.empty !== "no-timetable" &&
    schedule.empty !== "no-class-today";

  return (
    <div className="space-y-3 md:hidden">
      {edtLoading ? (
        <NowSkeleton />
      ) : edtError ? (
        <section
          aria-labelledby="maintenant-error-title"
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            Maintenant
          </p>
          <h2
            id="maintenant-error-title"
            className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Emploi du temps indisponible
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Impossible de charger les cours du jour.
          </p>
          <div className="mt-2">
            <TimetableLink />
          </div>
        </section>
      ) : schedule?.featured ? (
        <NowCard view={schedule.featured} todayIso={todayIso} />
      ) : schedule?.empty ? (
        <EmptyNow kind={schedule.empty} nextDayLabel={schedule.nextDayLabel} />
      ) : null}

      <TeacherMetricStrip chips={chips} />

      {showEnsuite && schedule ? (
        <EnsuiteList
          rest={schedule.rest}
          todayIso={todayIso}
          dayFinished={schedule.empty === "day-finished"}
        />
      ) : null}
    </div>
  );
}
