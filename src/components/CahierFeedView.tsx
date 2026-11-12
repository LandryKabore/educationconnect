import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { fetchCahierFeed } from "@/lib/scaleApi";
import { Badge, Card, EmptyState, Select } from "@/components/ui";
import { ScreenSkeleton } from "@/components/Skeleton";
import { QueryError } from "@/components/QueryError";
import { isNativeApp } from "@/lib/platform";
import { BookOpen, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { INK, IosEmpty, MUTED } from "@/components/native/ios";

const longDate = (s: string) => format(new Date(`${s}T12:00:00`), "EEEE d MMMM", { locale: fr });

/** Read-only lesson log of one class (student and parent view): what was taught + homework, newest first. */
export function CahierFeedView({ classId }: { classId: string }) {
  const [subject, setSubject] = useState("");
  const from = format(addDays(new Date(), -45), "yyyy-MM-dd");
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["cahier-feed", classId],
    queryFn: () => fetchCahierFeed(classId, { from, limit: 150 }),
  });

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((e) => m.set(e.subjectId, e.subject));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [data]);

  const days = useMemo(() => {
    const g = new Map<string, typeof data>();
    data
      .filter((e) => !subject || e.subjectId === subject)
      .forEach((e) => g.set(e.entryDate, [...(g.get(e.entryDate) ?? []), e]));
    return [...g.entries()];
  }, [data, subject]);

  if (isLoading) return <ScreenSkeleton />;
  if (isError) {
    return <QueryError message="Impossible de charger le cahier de textes." onRetry={() => void refetch()} />;
  }
  if (isNativeApp()) {
    if (data.length === 0) {
      return <IosEmpty icon={<BookOpen strokeWidth={1.4} />} title="Cahier vide" message="Rien dans le cahier pour le moment." />;
    }
    const flat = days.flatMap(([, items]) => items);
    return (
      <div className="space-y-3">
        {subjects.length > 1 ? (
          <label className="ios-field relative flex items-center justify-between !rounded-[14px] px-[14px] py-3">
            <span className={cn("text-[15px] font-medium", INK)}>
              {subjects.find(([id]) => id === subject)?.[1] ?? "Toutes les matières"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-[#64748b]" />
            <select
              aria-label="Matière"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="absolute inset-0 h-full w-full opacity-0"
            >
              <option value="">Toutes les matières</option>
              {subjects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="space-y-[6px]">
          {flat.map((e) => (
            <div key={e.id} className="ios-card !rounded-[14px] space-y-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("text-[15px] font-semibold", INK)}>{e.subject || "Cours"}</p>
                <p className="shrink-0 text-xs font-semibold capitalize text-[#153064] dark:text-slate-100">
                  {format(new Date(`${e.entryDate}T12:00:00`), "EEE d MMM", { locale: fr })}
                </p>
              </div>
              {e.content ? <p className={cn("text-[15px] opacity-90", INK)}>{e.content}</p> : null}
              {e.homework ? (
                <div className="space-y-0.5 rounded-xl bg-[#f0fdfa] p-[10px] dark:bg-[var(--surface-2)]">
                  <p className={cn("text-[11px] font-bold", MUTED)}>À faire</p>
                  <p className={cn("text-[15px]", INK)}>{e.homework}</p>
                  {e.dueDate ? <p className={cn("text-xs", MUTED)}>Pour le {longDate(e.dueDate)}</p> : null}
                </div>
              ) : null}
              {e.teacher ? <p className={cn("text-xs", MUTED)}>{e.teacher}</p> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (data.length === 0) {
    return <EmptyState message="Les professeurs n'ont rien écrit dans le cahier de textes ces 45 derniers jours." />;
  }

  return (
    <div className="space-y-4">
      {subjects.length > 1 ? (
        <div className="max-w-xs">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Matière">
            <option value="">Toutes les matières</option>
            {subjects.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {days.map(([day, items]) => (
        <Card key={day}>
          <h3 className="font-semibold capitalize text-slate-900">{longDate(day)}</h3>
          <ul className="mt-3 space-y-3">
            {items.map((e) => (
              <li key={e.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-700">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {e.subject}
                  {e.teacher ? <span className="font-normal text-slate-500"> · {e.teacher}</span> : null}
                </p>
                {e.content ? <p className="mt-1 text-slate-700 dark:text-slate-300">{e.content}</p> : null}
                {e.homework ? (
                  <p className="mt-1 text-slate-700 dark:text-slate-300">
                    <Badge tone="warning">À faire</Badge> {e.homework}
                    {e.dueDate ? <span className="text-slate-500"> · pour le {longDate(e.dueDate)}</span> : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
