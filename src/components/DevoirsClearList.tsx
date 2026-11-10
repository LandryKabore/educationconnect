import { useEffect, useId, useMemo, useState } from "react";
import { addDays, format, isPast, isSameDay, isSameWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import type { Evaluation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, EmptyState, PageLoadingState } from "@/components/ui";

export type DevoirListItem = Evaluation & {
  matieres: { name: string } | null;
};

type FilterKey = "upcoming" | "past" | "graded";

type Props = {
  items: DevoirListItem[];
  gradedIds: Set<string>;
  /** Confirmed school exams (with time slot) vs home exercises. */
  isExam: boolean;
  isLoading?: boolean;
  emptyMessage: string;
  hint?: string;
};

type Row = {
  item: DevoirListItem;
  status: {
    filter: FilterKey;
    label: string;
    tone: "success" | "warning" | "info" | "default";
  };
  schedule: string | null;
};

const SUBJECT_TONES = [
  { bar: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" },
  { bar: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  { bar: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300" },
  { bar: "bg-sky-600", text: "text-sky-800 dark:text-sky-300" },
  { bar: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  { bar: "bg-amber-500", text: "text-amber-800 dark:text-amber-300" },
  { bar: "bg-teal-600", text: "text-teal-800 dark:text-teal-300" },
];

function subjectTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % 997;
  }
  return SUBJECT_TONES[hash % SUBJECT_TONES.length]!;
}

function dueDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (value.length === 10) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }
  const parsed = parseValidDate(value);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function chipLabel(date: Date | null, now: Date): string {
  if (!date) return "Sans date";
  if (isSameDay(date, now)) return "Aujourd’hui";
  if (isSameDay(date, addDays(now, 1))) return "Demain";
  if (isSameDay(date, addDays(now, -1))) return "Hier";
  const text = format(date, "EEE d MMM", { locale: fr });
  return text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
}

function chipClass(label: string): string {
  if (label === "Demain" || label === "Aujourd’hui") {
    return "bg-amber-100 text-amber-950 dark:bg-amber-600 dark:text-amber-50";
  }
  if (label === "Hier") {
    return "bg-rose-100 text-rose-900 dark:bg-rose-800 dark:text-rose-50";
  }
  return "bg-sky-100 text-sky-900 dark:bg-sky-800 dark:text-sky-50";
}

function groupMeta(
  filter: FilterKey,
  date: Date | null,
  now: Date,
): { key: string; label: string; order: number } {
  if (filter === "graded") {
    if (!date) return { key: "none", label: "Sans date", order: 1 };
    const label = format(date, "MMMM yyyy", { locale: fr });
    return {
      key: format(date, "yyyy-MM"),
      label: label.charAt(0).toLocaleUpperCase("fr") + label.slice(1),
      order: -Number(format(date, "yyyyMM")),
    };
  }
  if (!date) return { key: "none", label: "Sans date", order: 4 };
  if (filter === "upcoming") {
    if (isSameDay(date, now)) return { key: "today", label: "Aujourd’hui", order: 0 };
    if (isSameDay(date, addDays(now, 1))) {
      return { key: "tomorrow", label: "Demain", order: 1 };
    }
    if (isSameWeek(date, now, { weekStartsOn: 1 }) && date > startOfToday(now)) {
      return { key: "week", label: "Cette semaine", order: 2 };
    }
    return { key: "later", label: "Plus tard", order: 3 };
  }
  if (isSameDay(date, addDays(now, -1))) {
    return { key: "yesterday", label: "Hier", order: 0 };
  }
  if (isSameWeek(date, now, { weekStartsOn: 1 })) {
    return { key: "week", label: "Cette semaine", order: 1 };
  }
  return { key: "earlier", label: "Plus tôt", order: 2 };
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function itemStatus(
  item: DevoirListItem,
  graded: boolean,
  isExam: boolean,
): Row["status"] {
  const dueAt = parseValidDate(
    item.eval_date?.length === 10
      ? `${item.eval_date}T23:59:59`
      : item.eval_date,
  );
  const past = !!dueAt && isPast(dueAt);

  if (graded) {
    return { filter: "graded", label: "Noté", tone: "success" };
  }
  if (past) {
    return {
      filter: "past",
      label: isExam ? "Terminé" : "En retard",
      tone: "info",
    };
  }
  return {
    filter: "upcoming",
    label: isExam ? "À venir" : "À faire",
    tone: "warning",
  };
}

export function DevoirsClearList({
  items,
  gradedIds,
  isExam,
  isLoading,
  emptyMessage,
  hint,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("upcoming");
  const [hintOpen, setHintOpen] = useState(false);
  const hintId = useId();

  const enriched = useMemo(
    () =>
      items.map((item) => {
        const status = itemStatus(item, gradedIds.has(item.id), isExam);
        const schedule = formatExamSchedule({
          due_date: item.eval_date,
          start_time: item.start_time,
          end_time: item.end_time,
        });
        return { item, status, schedule };
      }),
    [items, gradedIds, isExam],
  );

  const counts = useMemo(() => {
    const c = { upcoming: 0, past: 0, graded: 0 };
    for (const row of enriched) c[row.status.filter] += 1;
    return c;
  }, [enriched]);

  // Prefer a non-empty tab when the default one has nothing.
  useEffect(() => {
    if (items.length === 0) return;
    if (counts[filter] > 0) return;
    const next = (["upcoming", "past", "graded"] as const).find(
      (k) => counts[k] > 0,
    );
    if (next) setFilter(next);
  }, [items.length, counts, filter]);

  const shown = enriched.filter((row) => row.status.filter === filter);
  const groups = useMemo(() => groupRows(shown, filter), [shown, filter]);

  const tabs: { key: FilterKey; label: string }[] = isExam
    ? [
        { key: "upcoming", label: "À venir" },
        { key: "past", label: "Terminés" },
        { key: "graded", label: "Notés" },
      ]
    : [
        { key: "upcoming", label: "À faire" },
        { key: "past", label: "En retard" },
        { key: "graded", label: "Notés" },
      ];

  if (isLoading) {
    return (
      <PageLoadingState
        message={
          isExam ? "Chargement des devoirs…" : "Chargement des exercices…"
        }
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-2">
          {tabs.map((tab) => {
            const selected = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  selected
                    ? "border-brand-600 bg-brand-700 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 dark:border-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-200",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                    selected
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
                  )}
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
        {hint ? (
          <button
            type="button"
            aria-expanded={hintOpen}
            aria-controls={hintId}
            onClick={() => setHintOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={hintOpen ? "Masquer l’aide" : "Aide"}
          >
            ?
          </button>
        ) : null}
      </div>

      {hint && hintOpen ? (
        <p
          id={hintId}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
        >
          {hint}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          message={
            isExam
              ? "Aucun devoir dans cet onglet."
              : "Aucun exercice dans cet onglet."
          }
        />
      ) : (
        <>
          <div className="space-y-5 sm:hidden">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {group.label}
                  </h2>
                  <span className="text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                    {group.items.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {group.items.map((row) => (
                    <li key={row.item.id}>
                      <HomeworkCard row={row} isExam={isExam} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block dark:border-[var(--border)] dark:bg-[var(--surface)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-[var(--border)] dark:bg-[var(--surface-2)]">
                    <th className="px-4 py-3">Matière</th>
                    <th className="px-4 py-3">Titre</th>
                    <th className="px-4 py-3">
                      {isExam ? "Date & créneau" : "Échéance"}
                    </th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ item, status, schedule }) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 last:border-0 dark:border-[var(--border)]"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {item.matieres?.name ?? "Matière"}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        <p className="font-medium">{item.title}</p>
                        {item.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                            {item.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-200">
                        {item.eval_date ? (
                          <>
                            {formatDateSafe(item.eval_date, "EEE d MMM yyyy", {
                              locale: fr,
                            })}
                            {isExam && schedule ? (
                              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                                {schedule}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function groupRows(rows: Row[], filter: FilterKey) {
  const now = new Date();
  const map = new Map<
    string,
    { key: string; label: string; order: number; items: Row[] }
  >();
  for (const row of rows) {
    const date = dueDay(row.item.eval_date);
    const meta = groupMeta(filter, date, now);
    const existing = map.get(meta.key);
    if (existing) existing.items.push(row);
    else map.set(meta.key, { ...meta, items: [row] });
  }
  const groups = [...map.values()].sort((a, b) => a.order - b.order);
  for (const group of groups) {
    group.items.sort((a, b) => {
      const left = dueDay(a.item.eval_date)?.getTime() ?? 0;
      const right = dueDay(b.item.eval_date)?.getTime() ?? 0;
      return filter === "upcoming" ? left - right : right - left;
    });
  }
  return groups;
}

function HomeworkCard({ row, isExam }: { row: Row; isExam: boolean }) {
  const { item, schedule } = row;
  const subject = item.matieres?.name ?? "Matière";
  const tone = subjectTone(subject);
  const date = dueDay(item.eval_date);
  const label = chipLabel(date, new Date());
  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-[var(--surface)]">
      <span className={cn("absolute inset-y-0 left-0 w-1", tone.bar)} aria-hidden />
      <div className="px-4 py-3 pl-5">
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-bold uppercase tracking-wide", tone.text)}>
          {subject}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            chipClass(label),
          )}
        >
          {label}
        </span>
      </div>
      <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {item.title}
      </h3>
      {item.description ? (
        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
          {item.description}
        </p>
      ) : null}
      {isExam && schedule ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {schedule}
        </p>
      ) : null}
      </div>
    </article>
  );
}
