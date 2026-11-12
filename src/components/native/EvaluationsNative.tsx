import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Clock, FileText, ChevronDown, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { subjectSwatch } from "@/lib/subjectColors";
import { parseValidDate } from "@/lib/dateFr";
import { cn } from "@/lib/utils";
import type { DevoirListItem } from "@/components/DevoirsClearList";
import { Capsule, INK, IOS, IosEmpty, MUTED, SummaryCard, rgb } from "@/components/native/ios";

type Props = {
  items: DevoirListItem[];
  gradedIds: Set<string>;
  isExam: boolean;
  className: string;
  isLoading?: boolean;
};

type Filter = "all" | "todo" | "upcoming" | "past" | "graded";

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

function eventDay(item: DevoirListItem): Date | null {
  const raw = item.eval_date;
  if (!raw) return null;
  return parseValidDate(raw.length === 10 ? `${raw}T00:00:00` : raw);
}

/** Moment of the deadline (start of the paper for a devoir, end of day for an exercise). */
function dueMoment(item: DevoirListItem, isExam: boolean): Date | null {
  const day = eventDay(item);
  if (!day) return null;
  const d = new Date(day);
  const start = hm(item.start_time);
  if (isExam && start) {
    const [h, m] = start.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(23, 59, 0, 0);
  }
  return d;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayDelta(d: Date, now: Date) {
  return Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

function relativeDay(item: DevoirListItem, now: Date): string {
  const day = eventDay(item);
  if (!day) return "Planifié";
  const delta = dayDelta(day, now);
  if (delta === 0) return "Aujourd’hui";
  if (delta === 1) return "Demain";
  if (delta > 1) return "À venir";
  return "Passé";
}

function countdown(item: DevoirListItem, isExam: boolean, now: Date) {
  const due = dueMoment(item, isExam);
  if (!due) return null;
  const mins = Math.round((due.getTime() - now.getTime()) / 60_000);
  const sameDay = dayDelta(due, now) === 0;
  if (mins < 0) {
    const late = Math.abs(mins);
    const text = late < 60 ? `${late} min` : late < 1440 ? `${Math.floor(late / 60)} h` : `${Math.floor(late / 1440)} j`;
    return { text: `En retard · ${text}`, color: IOS.red };
  }
  const color = sameDay ? IOS.orange : IOS.navy;
  if (mins < 1) return { text: "Maintenant", color };
  if (mins < 60) return { text: `Dans ${mins} min`, color };
  if (mins < 1440) return { text: `Dans ${Math.floor(mins / 60)} h`, color };
  return { text: `Dans ${Math.floor(mins / 1440)} j`, color };
}

export function EvaluationsNative({ items, gradedIds, isExam, className, isLoading }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const accent = isExam ? IOS.navy : IOS.red;
  const noun = isExam ? "devoir" : "exercice";

  const rows = useMemo(() => {
    const enriched = items.map((item) => {
      const graded = gradedIds.has(item.id);
      const due = dueMoment(item, isExam);
      const past = !!due && due.getTime() < now.getTime();
      return { item, graded, past, due };
    });
    if (isExam) {
      const up = enriched
        .filter((r) => !r.past)
        .sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
      const ps = enriched
        .filter((r) => r.past)
        .sort((a, b) => (b.due?.getTime() ?? 0) - (a.due?.getTime() ?? 0));
      return [...up, ...ps];
    }
    return enriched.sort((a, b) => (b.due?.getTime() ?? 0) - (a.due?.getTime() ?? 0));
  }, [items, gradedIds, isExam, now]);

  const todo = rows.filter((r) => !r.graded && !(isExam && r.past)).length;
  const gradedCount = rows.filter((r) => r.graded).length;

  const filtered = rows.filter((r) => {
    switch (filter) {
      case "todo":
        return !r.graded;
      case "upcoming":
        return !r.past && !r.graded;
      case "past":
        return r.past;
      case "graded":
        return r.graded;
      default:
        return true;
    }
  });

  const chips: { key: Filter; label: string }[] = isExam
    ? [
        { key: "all", label: "Tout" },
        { key: "upcoming", label: "À venir" },
        { key: "past", label: "Passés" },
        { key: "graded", label: "Notés" },
      ]
    : [
        { key: "all", label: "Tout" },
        { key: "todo", label: "À faire" },
        { key: "graded", label: "Notés" },
      ];

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="ios-card h-[84px] animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="ios-card h-[92px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <IosEmpty
        icon={isExam ? <FileText strokeWidth={1.4} /> : <ClipboardList strokeWidth={1.4} />}
        title={isExam ? "Aucun devoir" : "Aucun exercice"}
        message={
          isExam
            ? "Aucun devoir confirmé pour le moment."
            : "Aucun exercice de maison pour le moment."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="native-sticky sticky top-[52px] z-10 -mx-4 space-y-3 px-4 pb-2 pt-1">
        <SummaryCard
          color={accent}
          icon={
            isExam ? (
              <FileText className="h-[22px] w-[22px]" fill="currentColor" strokeWidth={1.5} />
            ) : (
              <BookOpen className="h-[22px] w-[22px]" fill="currentColor" strokeWidth={1.5} />
            )
          }
          caption={className || (isExam ? "Devoirs" : "Exercices")}
          title={`${rows.length} ${noun}${rows.length === 1 ? "" : "s"}`}
          detail={`${todo} ${isExam ? "à venir" : "à faire"} · ${gradedCount} noté${gradedCount === 1 ? "" : "s"}`}
        />
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={filter === c.key}
              onClick={() => setFilter(c.key)}
              className="ios-chip shrink-0"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <IosEmpty
          icon={<ClipboardList strokeWidth={1.4} />}
          title="Rien à afficher"
          message="Aucun élément ne correspond à ce filtre."
        />
      ) : (
        <div className="space-y-[10px]">
          {filtered.map(({ item, graded, past }) => {
            const sw = subjectSwatch(item.matieres?.name);
            const day = eventDay(item);
            const open = openId === item.id;
            const hasDetails = !!item.description?.trim();
            const cd = graded ? null : countdown(item, isExam, now);
            const start = hm(item.start_time);
            const end = hm(item.end_time);
            const timeText = start && end ? `${start} – ${end}` : start ? `à partir de ${start}` : null;
            const upcoming = !past && !graded;
            const badge = graded
              ? { text: "Noté", color: IOS.teal }
              : isExam
                ? { text: relativeDay(item, now), color: upcoming ? rgb(sw.border) : IOS.muted }
                : { text: "À faire", color: rgb(sw.border) };
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl"
                style={{
                  backgroundColor: "#fff",
                  backgroundImage: `linear-gradient(${rgb(sw.fill, 0.35)}, ${rgb(sw.fill, 0.35)}), linear-gradient(rgba(255,255,255,0.72), rgba(255,255,255,0.72))`,
                  border: `1px solid ${rgb(sw.border, 0.35)}`,
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 p-[14px] text-left"
                  onClick={() => hasDetails && setOpenId(open ? null : item.id)}
                  aria-expanded={hasDetails ? open : undefined}
                >
                  {isExam ? (
                    <div
                      className="flex w-12 shrink-0 flex-col items-center rounded-xl py-2"
                      style={{ backgroundColor: upcoming ? rgb(sw.fill, 0.9) : "#f8fafc" }}
                    >
                      <span
                        className="text-[20px] font-bold leading-none tabular-nums"
                        style={{ color: upcoming ? rgb(sw.border) : IOS.ink }}
                      >
                        {day ? format(day, "d") : "–"}
                      </span>
                      <span className="mt-1 text-[11px] font-bold uppercase text-[#64748b]">
                        {day ? format(day, "MMM", { locale: fr }) : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="w-1 self-stretch rounded-sm" style={{ backgroundColor: rgb(sw.border) }} />
                  )}
                  <div className="min-w-0 flex-1 space-y-[6px]">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-[15px] font-semibold leading-snug", INK)}>{item.title}</p>
                      <Capsule color={badge.color} className="shrink-0">
                        {badge.text}
                      </Capsule>
                    </div>
                    <Capsule
                      color={rgb(sw.border)}
                      className="max-w-full truncate !text-xs !font-semibold"
                      style={{ backgroundColor: rgb(sw.border, 0.12) }}
                    >
                      {item.matieres?.name ?? "Matière"}
                    </Capsule>
                    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", MUTED)}>
                      {isExam && timeText ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#153064] dark:text-slate-100">
                          <Clock className="h-3 w-3" />
                          {timeText}
                        </span>
                      ) : null}
                      {day ? (
                        <span className="inline-flex items-center gap-1 capitalize">
                          <CalendarDays className="h-3 w-3" />
                          {format(day, "EEEE d MMM", { locale: fr })}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {cd ? <Capsule color={cd.color}>{cd.text}</Capsule> : null}
                      {item.period_label ? (
                        <span className={cn("text-[11px]", MUTED)}>{item.period_label}</span>
                      ) : null}
                    </div>
                  </div>
                  {hasDetails ? (
                    <ChevronDown
                      className={cn("mt-1 h-4 w-4 shrink-0 text-[#64748b] transition-transform", open && "rotate-180")}
                    />
                  ) : null}
                </button>
                {open && hasDetails ? (
                  <div className="border-t border-black/5 px-[14px] py-3">
                    <p className={cn("whitespace-pre-line text-[15px] leading-snug opacity-90", INK)}>
                      {item.description}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
