import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { isPast, isWithinInterval, parseISO, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarRange, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompositionsPendingChanges } from "@/hooks/useCompositionRealtime";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge, Card, EmptyState } from "@/components/ui";

type Paper = {
  id: string;
  session_id: string;
  eval_date: string | null;
  start_time: string | null;
  end_time: string | null;
  matieres: { name: string } | null;
};

type SessionRow = {
  id: string;
  title: string;
  period_label: string;
  starts_on: string;
  ends_on: string;
  papers: Omit<Paper, "session_id">[];
};

function sessionStatus(startsOn: string, endsOn: string) {
  const today = startOfDay(new Date());
  const start = startOfDay(parseISO(startsOn));
  const end = startOfDay(parseISO(endsOn));
  if (isWithinInterval(today, { start, end })) {
    return { key: "running" as const, label: "En cours", tone: "warning" as const };
  }
  if (isPast(end)) {
    return { key: "done" as const, label: "Terminée", tone: "info" as const };
  }
  return { key: "upcoming" as const, label: "À venir", tone: "success" as const };
}

/** Whole days from today to an ISO day (negative = past). */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - today) / 86_400_000);
}

export default function MesCompositions() {
  const { user } = useAuth();
  const { markSeen } = useCompositionsPendingChanges();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["mes-compositions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (!enrollment) return [] as SessionRow[];

      const classId = (enrollment as { class_section_id: string }).class_section_id;

      const { data, error } = await supabase
        .from("composition_sessions")
        .select("id, title, period_label, starts_on, ends_on")
        .eq("class_section_id", classId)
        .order("starts_on", { ascending: false });
      if (error) throw error;

      const list = (data ?? []) as Omit<SessionRow, "papers">[];
      if (list.length === 0) return [] as SessionRow[];

      const { data: papers, error: papersError } = await supabase
        .from("evaluations")
        .select("id, session_id, eval_date, start_time, end_time, matieres(name)")
        .in(
          "session_id",
          list.map((s) => s.id),
        )
        .eq("type", "composition")
        .order("eval_date", { ascending: true });
      if (papersError) throw papersError;

      const bySession = new Map<string, SessionRow["papers"]>();
      for (const p of (papers ?? []) as unknown as Paper[]) {
        const rows = bySession.get(p.session_id) ?? [];
        rows.push({
          id: p.id,
          eval_date: p.eval_date,
          start_time: p.start_time,
          end_time: p.end_time,
          matieres: p.matieres,
        });
        bySession.set(p.session_id, rows);
      }

      return list.map((s): SessionRow => ({ ...s, papers: bySession.get(s.id) ?? [] }));
    },
  });

  const counts = { upcoming: 0, running: 0, done: 0 };
  for (const s of sessions) counts[sessionStatus(s.starts_on, s.ends_on).key] += 1;
  // the composition to feature: the one running, else the next one to start
  const featured =
    sessions.find((s) => sessionStatus(s.starts_on, s.ends_on).key === "running") ??
    [...sessions]
      .filter((s) => sessionStatus(s.starts_on, s.ends_on).key === "upcoming")
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ??
    null;

  return (
    // squarer corners on this page only
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Banner: same teal gradient and effects as the home banner */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Programme de l’école</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">Mes compositions</h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                Chaque composition regroupe les épreuves de ta classe. Les notes arrivent dans « Mes notes ».
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat label="À venir" value={String(counts.upcoming)} hint={counts.upcoming > 1 ? "compositions" : "composition"} />
              <BannerStat label="En cours" value={String(counts.running)} hint={counts.running ? "en ce moment" : "aucune"} />
              <BannerStat label="Terminées" value={String(counts.done)} hint="cette année" />
            </div>
          </div>
          <div className="lg:col-span-5">
            <FeaturedCard session={featured} />
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : sessions.length === 0 ? (
        <EmptyState message="Aucune composition programmée pour le moment." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const status = sessionStatus(session.starts_on, session.ends_on);
            return (
              <Card key={session.id} className="h-full">
                <div className="flex h-full flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{session.title}</h3>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {session.period_label}
                        <span> · </span>
                        {formatDateSafe(session.starts_on, "d MMM", { locale: fr })}
                        {" – "}
                        {formatDateSafe(session.ends_on, "d MMM yyyy", { locale: fr })}
                        <span> · </span>
                        {session.papers.length} épreuve{session.papers.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {session.papers.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-700">
                      {session.papers.map((paper) => {
                        const slot = formatExamSchedule({
                          due_date: paper.eval_date,
                          start_time: paper.start_time,
                          end_time: paper.end_time,
                        });
                        return (
                          <li key={paper.id} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                            <span>
                              <span className="font-medium text-slate-800 dark:text-slate-100">
                                {paper.matieres?.name ?? "Matière"}
                              </span>
                              {paper.eval_date
                                ? ` · ${formatDateSafe(paper.eval_date, "EEE d MMM", { locale: fr })}`
                                : ""}
                              {slot ? ` · ${slot}` : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">Programme des épreuves à venir.</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BannerStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md bg-white/10 p-3.5 ring-1 ring-white/15">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums lg:text-[1.75rem]">{value}</p>
      <p className="mt-0.5 truncate text-xs text-white/80">{hint}</p>
    </div>
  );
}

/** White card in the banner: the composition running now, or the next one. */
function FeaturedCard({ session }: { session: SessionRow | null }) {
  if (!session) {
    return (
      <div className="rounded-md bg-white/10 p-5 ring-1 ring-white/15">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Prochaine composition</p>
        <p className="mt-2 text-lg font-semibold">Aucune composition à venir</p>
      </div>
    );
  }
  const startIn = daysUntil(session.starts_on);
  const totalDays = Math.max(1, daysUntil(session.ends_on) - startIn + 1);
  const running = startIn <= 0;
  const headline = running
    ? `En cours · jour ${Math.min(totalDays, -startIn + 1)} sur ${totalDays}`
    : startIn === 1
      ? "Commence demain"
      : `Commence dans ${startIn} jours`;
  return (
    <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
            running ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800",
          )}
        >
          <CalendarRange className="h-3 w-3" />
          {running ? "Composition en cours" : "Prochaine composition"}
        </span>
        <span className={cn("text-xs font-bold", !running && startIn <= 2 ? "text-rose-600" : "text-slate-500")}>
          {headline}
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-bold text-slate-900">{session.title}</p>
      <p className="mt-0.5 text-sm text-slate-500">
        {session.period_label} · du {formatDateSafe(session.starts_on, "d MMM", { locale: fr })} au{" "}
        {formatDateSafe(session.ends_on, "d MMM", { locale: fr })} · {session.papers.length} épreuve
        {session.papers.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
