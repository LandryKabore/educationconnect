import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { BookOpenCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchHomeworkUpcoming, type HomeworkItem } from "@/lib/scaleApi";
import { Badge, Card } from "@/components/ui";

const longDate = (s: string) => format(new Date(`${s}T12:00:00`), "EEEE d MMMM", { locale: fr });

/** Home screen card "Travail à faire pour demain" (students and parents). Data comes from the lesson log. */
export function HomeworkTomorrowCard({
  userId,
  moreHref,
  className,
  showChildren = true,
}: {
  userId: string | undefined;
  /** Where "Voir le cahier de textes" leads (student: /mon-cahier, parent: /enfants/<id>/cahier). */
  moreHref?: string | null;
  className?: string;
  /** Show the child's name on each line (parents with several children). Students pass false. */
  showChildren?: boolean;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const { data = [], isLoading } = useQuery({
    queryKey: ["devoirs-demain", userId, today],
    enabled: !!userId,
    queryFn: () => fetchHomeworkUpcoming(today, format(addDays(new Date(), 7), "yyyy-MM-dd")),
  });

  if (isLoading || data.length === 0) {
    return null; // nothing to show: keep the home screen quiet
  }

  const kidIds = new Set(data.flatMap((h) => h.children.map((c) => c.id)));
  const namesVisible = showChildren && kidIds.size > 1;
  const forTomorrow = data.filter((h) => h.dueDate === tomorrow);
  const later = data.filter((h) => h.dueDate && h.dueDate > tomorrow);
  const noDate = data.filter((h) => !h.dueDate);
  const overdueToday = data.filter((h) => h.dueDate && h.dueDate <= today);

  const row = (h: HomeworkItem) => (
    <li key={h.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-700">
      <p className="font-medium text-slate-900 dark:text-slate-100">
        {h.subject}
        {namesVisible && h.children.length > 0 && h.children.length < 5 ? (
          <span className="font-normal text-slate-500"> · {h.children.map((c) => c.name).join(", ")}</span>
        ) : null}
      </p>
      <p className="mt-0.5 text-slate-700 dark:text-slate-300">{h.homework}</p>
      {h.dueDate && h.dueDate !== tomorrow ? (
        <p className="mt-0.5 text-xs capitalize text-slate-500">Pour le {longDate(h.dueDate)}</p>
      ) : null}
    </li>
  );

  const section = (title: string, items: HomeworkItem[], tone: "warning" | "info" | "default" | "danger") =>
    items.length === 0 ? null : (
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          {title} <Badge tone={tone}>{items.length}</Badge>
        </p>
        <ul className="space-y-2">{items.map(row)}</ul>
      </div>
    );

  return (
    <Card className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
          <BookOpenCheck className="h-5 w-5 text-brand-700" />
          Travail à faire
        </h2>
        {moreHref ? (
          <Link to={moreHref} className="text-sm font-medium text-brand-700 hover:underline">
            Voir le cahier de textes
          </Link>
        ) : null}
      </div>
      <div className="space-y-4">
        {section("Pour aujourd'hui", overdueToday, "danger")}
        {section("Pour demain", forTomorrow, "warning")}
        {section("Les jours suivants", later, "info")}
        {section("Sans date précise", noDate, "default")}
      </div>
    </Card>
  );
}
