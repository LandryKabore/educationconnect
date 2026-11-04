import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { fetchCahierFeed } from "@/lib/scaleApi";
import { Badge, Card, EmptyState, Select } from "@/components/ui";

const longDate = (s: string) => format(new Date(`${s}T12:00:00`), "EEEE d MMMM", { locale: fr });

/** Read-only lesson log of one class (student and parent view): what was taught + homework, newest first. */
export function CahierFeedView({ classId }: { classId: string }) {
  const [subject, setSubject] = useState("");
  const from = format(addDays(new Date(), -45), "yyyy-MM-dd");
  const { data = [], isLoading } = useQuery({
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

  if (isLoading) return <p className="text-slate-500">Chargement…</p>;
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
