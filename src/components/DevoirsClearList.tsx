import { useEffect, useMemo, useState } from "react";
import { isPast } from "date-fns";
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

function itemStatus(
  item: DevoirListItem,
  graded: boolean,
  isExam: boolean,
): {
  filter: FilterKey;
  label: string;
  tone: "success" | "warning" | "info" | "default";
} {
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
      label: isExam ? "Terminé" : "Échéance passée",
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

  const tabs: { key: FilterKey; label: string }[] = isExam
    ? [
        { key: "upcoming", label: "À venir" },
        { key: "past", label: "Terminés" },
        { key: "graded", label: "Notés" },
      ]
    : [
        { key: "upcoming", label: "À faire" },
        { key: "past", label: "Échéance passée" },
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
      {hint ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          {hint}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const selected = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
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

      {shown.length === 0 ? (
        <EmptyState
          message={
            isExam
              ? "Aucun devoir dans cet onglet."
              : "Aucun exercice dans cet onglet."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]">
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
      )}
    </div>
  );
}
