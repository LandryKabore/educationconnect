import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { BookOpenCheck, CalendarCheck2, NotebookPen, PartyPopper } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fetchCahierFeed, type CahierFeedItem } from "@/lib/scaleApi";
import { subjectSwatch } from "@/lib/subjectColors";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

const DAYS_BACK = 45;

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function parseDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

/** Whole days from today (negative = past). */
function daysFromToday(iso: string) {
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12).getTime();
  return Math.round((parseDay(iso).getTime() - today) / 86_400_000);
}

function dayHeading(iso: string) {
  const d = daysFromToday(iso);
  if (d === 0) return "Aujourd’hui";
  if (d === -1) return "Hier";
  if (d === 1) return "Demain";
  const label = format(parseDay(iso), "EEEE d MMMM", { locale: fr });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dueLabel(iso: string): { text: string; urgent: boolean; past: boolean } {
  const d = daysFromToday(iso);
  if (d < 0) return { text: `Était pour le ${format(parseDay(iso), "d MMM", { locale: fr })}`, urgent: false, past: true };
  if (d === 0) return { text: "Pour aujourd’hui", urgent: true, past: false };
  if (d === 1) return { text: "Pour demain", urgent: true, past: false };
  return {
    text: `Pour ${format(parseDay(iso), "EEEE d MMM", { locale: fr })} · dans ${d} j`,
    urgent: d <= 3,
    past: false,
  };
}

/** Student: the lesson log of his/her class. */
export default function MonCahier() {
  const { user } = useAuth();
  const { data: enrollment, isLoading: loadingClass } = useQuery({
    queryKey: ["mon-cahier-classe", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as { class_section_id: string; classes: { name: string } | null } | null;
    },
  });

  const classId = enrollment?.class_section_id;
  const from = isoDay(addDays(new Date(), -DAYS_BACK));
  const { data: feed = [], isLoading: loadingFeed } = useQuery({
    queryKey: ["cahier-feed", classId],
    enabled: !!classId,
    queryFn: () => fetchCahierFeed(classId!, { from, limit: 150 }),
  });

  const [subject, setSubject] = useState("");
  const [homeworkOnly, setHomeworkOnly] = useState(false);

  const subjects = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    feed.forEach((e) => {
      const cur = m.get(e.subjectId);
      m.set(e.subjectId, { name: e.subject, count: (cur?.count ?? 0) + 1 });
    });
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "fr"));
  }, [feed]);

  const days = useMemo(() => {
    const g = new Map<string, CahierFeedItem[]>();
    feed
      .filter((e) => (!subject || e.subjectId === subject) && (!homeworkOnly || !!e.homework))
      .forEach((e) => g.set(e.entryDate, [...(g.get(e.entryDate) ?? []), e]));
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [feed, subject, homeworkOnly]);

  const todo = useMemo(() => {
    const today = isoDay(new Date());
    return feed
      .filter((e) => e.homework && e.dueDate && e.dueDate >= today)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [feed]);

  const todoGroups = useMemo(() => {
    const groups: { title: string; items: CahierFeedItem[] }[] = [
      { title: "Pour demain", items: [] },
      { title: "Cette semaine", items: [] },
      { title: "Plus tard", items: [] },
    ];
    for (const e of todo) {
      const d = daysFromToday(e.dueDate!);
      if (d <= 1) groups[0].items.push(e);
      else if (d <= 7) groups[1].items.push(e);
      else groups[2].items.push(e);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [todo]);

  const loading = loadingClass || (!!classId && loadingFeed);
  const className = enrollment?.classes?.name;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">Cahier de textes</h1>
        <p className="text-sm text-slate-500">
          {className ? `Classe ${className} · ` : ""}ce qui a été fait en classe et le travail à faire, sur les{" "}
          {DAYS_BACK} derniers jours
        </p>
      </header>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-12" aria-busy="true" aria-label="Chargement">
          <div className="space-y-4 lg:col-span-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-lg bg-slate-100 lg:col-span-4" />
        </div>
      ) : !enrollment ? (
        <EmptyState message="Vous n'êtes inscrit dans aucune classe pour le moment." />
      ) : feed.length === 0 ? (
        <EmptyState message={`Les professeurs n'ont rien écrit dans le cahier de textes ces ${DAYS_BACK} derniers jours.`} />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1">
              <FilterChip on={!subject} onClick={() => setSubject("")}>
                Toutes les matières
              </FilterChip>
              {subjects.map(([id, s]) => (
                <FilterChip key={id} on={subject === id} onClick={() => setSubject(subject === id ? "" : id)}>
                  <span className={cn("h-2 w-2 rounded-full", subjectSwatch(s.name).dot)} />
                  {s.name}
                  <span className="opacity-60">{s.count}</span>
                </FilterChip>
              ))}
            </div>
            <div className="inline-flex shrink-0 self-start rounded-md bg-slate-100 p-1 dark:bg-[var(--surface-2)]">
              {[
                { on: !homeworkOnly, label: "Tout", value: false },
                { on: homeworkOnly, label: "Avec travail à faire", value: true },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={o.on}
                  onClick={() => setHomeworkOnly(o.value)}
                  className={cn(
                    "rounded-md px-3.5 py-1.5 text-sm font-semibold transition",
                    o.on
                      ? "bg-white text-slate-900 shadow-sm dark:bg-[var(--surface)]"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Timeline */}
            <div className="space-y-6 lg:col-span-8">
              {days.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Rien pour ce filtre.
                </div>
              ) : (
                days.map(([day, items]) => (
                  <section key={day}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h2 className="text-base font-bold text-slate-900">{dayHeading(day)}</h2>
                      <span className="text-xs text-slate-500">
                        {items.length} cours
                        {/* the date only adds something next to "Aujourd'hui", "Hier", "Demain" */}
                        {Math.abs(daysFromToday(day)) <= 1 ? ` · ${format(parseDay(day), "d MMMM", { locale: fr })}` : ""}
                      </span>
                    </div>
                    <ul className="space-y-3">
                      {items.map((e) => (
                        <EntryCard key={e.id} entry={e} />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>

            {/* To do */}
            <aside className="lg:col-span-4">
              {/* same heading row as the day headings on the left, so both cards start level */}
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-base font-bold text-slate-900">Travail à faire</h2>
                <span className="text-xs text-slate-500">
                  {todo.length === 0
                    ? "rien à rendre pour l’instant"
                    : `${todo.length} travail${todo.length > 1 ? "x" : ""} à venir`}
                </span>
              </div>
              <section className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:p-6 dark:border-white/10">

                {todo.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <PartyPopper className="h-5 w-5 shrink-0" />
                    Aucun travail noté pour les prochains jours.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {todoGroups.map((g) => (
                      <div key={g.title}>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.title}</p>
                        <ul className="space-y-2">
                          {g.items.map((e) => {
                            const due = dueLabel(e.dueDate!);
                            return (
                              <li key={e.id} className="rounded-md bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
                                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", subjectSwatch(e.subject).dot)} />
                                    <span className="truncate">{e.subject}</span>
                                  </span>
                                  <span
                                    className={cn(
                                      "shrink-0 text-[11px] font-bold",
                                      due.urgent ? "text-rose-600 dark:text-rose-400" : "text-slate-500",
                                    )}
                                  >
                                    {format(parseDay(e.dueDate!), "EEE d MMM", { locale: fr })}
                                  </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{e.homework}</p>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold ring-1 transition",
        on
          ? "bg-brand-700 text-white ring-brand-700 dark:bg-brand-600 dark:ring-brand-600"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:ring-white/10 dark:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function EntryCard({ entry: e }: { entry: CahierFeedItem }) {
  const swatch = subjectSwatch(e.subject);
  const due = e.homework && e.dueDate ? dueLabel(e.dueDate) : null;
  return (
    <li className="relative overflow-hidden rounded-lg border border-slate-200/80 bg-white p-5 pl-6 shadow-sm dark:border-white/10">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", swatch.dot)} aria-hidden />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-slate-900">{e.subject}</p>
        {e.teacher ? <p className="text-xs font-medium text-slate-500">{e.teacher}</p> : null}
      </div>

      {e.content ? (
        // same padding as the homework box below, so icons and text line up in one column
        <div className="mt-3 flex gap-3 rounded-md p-3">
          <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fait en classe</p>
            <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{e.content}</p>
          </div>
        </div>
      ) : null}

      {e.homework ? (
        <div
          className={cn(
            "mt-3 flex gap-3 rounded-md p-3",
            due?.past
              ? "bg-slate-50"
              : "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30",
          )}
        >
          <NotebookPen
            className={cn("mt-0.5 h-4 w-4 shrink-0", due?.past ? "text-slate-400" : "text-amber-600 dark:text-amber-300")}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p
                className={cn(
                  "text-[11px] font-bold uppercase tracking-wider",
                  due?.past ? "text-slate-500" : "text-amber-800 dark:text-amber-300",
                )}
              >
                Travail à faire
              </p>
              {due ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-semibold",
                    due.past ? "text-slate-400" : due.urgent ? "text-rose-600 dark:text-rose-400" : "text-amber-800 dark:text-amber-300",
                  )}
                >
                  <CalendarCheck2 className="h-3.5 w-3.5" />
                  {due.text}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-800 dark:text-slate-200">{e.homework}</p>
          </div>
        </div>
      ) : null}
    </li>
  );
}
