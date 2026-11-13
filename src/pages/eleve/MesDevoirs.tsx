import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useExercicesPendingChanges } from "@/hooks/useExamRealtime";
import { supabase } from "@/lib/supabase";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe } from "@/lib/dateFr";
import { cn, joinOne } from "@/lib/utils";
import { DevoirsClearList, type DevoirListItem } from "@/components/DevoirsClearList";

type Props = {
  isExam: boolean;
};

/** Whole days from today to an ISO day (negative = past). */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - today) / 86_400_000);
}

export default function MesDevoirs({ isExam }: Props) {
  const { user } = useAuth();
  const { markSeen: markExercicesSeen } = useExercicesPendingChanges();

  useEffect(() => {
    if (!isExam) markExercicesSeen();
  }, [isExam, markExercicesSeen]);

  const { data, isLoading } = useQuery({
    queryKey: ["mes-devoirs", user?.id, isExam],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (!enrollment) {
        return { className: "", items: [] as DevoirListItem[], gradedIds: [] as string[] };
      }

      const row = enrollment as { class_section_id: string; classes: unknown };
      const className = joinOne<{ name: string }>(row.classes)?.name ?? "";

      let q = supabase
        .from("evaluations")
        .select("*, matieres(name)")
        .eq("class_section_id", row.class_section_id)
        .eq("type", isExam ? "examen" : "devoir")
        .order("eval_date", { ascending: true });

      if (isExam) q = q.eq("admin_confirmed", true);

      const { data: rows, error } = await q;
      if (error) throw error;

      const evalIds = (rows ?? []).map((r) => (r as { id: string }).id);
      let gradedIds = new Set<string>();
      if (evalIds.length > 0) {
        const { data: graded } = await supabase
          .from("notes")
          .select("evaluation_id")
          .eq("student_id", user!.id)
          .in("evaluation_id", evalIds);
        gradedIds = new Set(
          (graded ?? [])
            .map((n) => (n as { evaluation_id: string | null }).evaluation_id)
            .filter((id): id is string => !!id),
        );
      }

      return {
        className,
        items: (rows ?? []) as DevoirListItem[],
        gradedIds: [...gradedIds],
      };
    },
  });

  const items = data?.items ?? [];
  const className = data?.className ?? "";
  const gradedIds = new Set(data?.gradedIds ?? []);

  // same buckets as the list below: graded, past (deadline gone), still to do
  let upcomingCount = 0;
  let pastCount = 0;
  for (const it of items) {
    if (gradedIds.has(it.id)) continue;
    const d = daysUntil(it.eval_date);
    if (d != null && d < 0) pastCount += 1;
    else upcomingCount += 1;
  }
  const next =
    items
      .filter((it) => !gradedIds.has(it.id) && (daysUntil(it.eval_date) ?? -1) >= 0)
      .sort((a, b) => (a.eval_date ?? "").localeCompare(b.eval_date ?? ""))[0] ?? null;

  const word = isExam ? "devoir" : "exercice";

  return (
    // squarer corners on this page only: the shared list keeps its radius on the parent screen
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      {/* Banner: same teal gradient and effects as the home banner */}
      <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
          <div className="space-y-5 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                {isExam ? "Devoirs surveillés" : "Travail à la maison"}
                {className ? ` · Classe ${className}` : ""}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-[2rem]">
                {isExam ? "Mes devoirs" : "Mes exercices de maison"}
              </h1>
              <p className="mt-2 text-sm font-medium text-white/85">
                {isExam
                  ? "Seuls les devoirs confirmés par l’établissement, avec la date et l’horaire."
                  : "À préparer et présenter en classe — rien n’est à rendre en ligne."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <BannerStat
                label={isExam ? "À venir" : "À faire"}
                value={String(upcomingCount)}
                hint={upcomingCount > 0 ? `${word}${upcomingCount > 1 ? "s" : ""} à venir` : "rien pour l’instant"}
              />
              <BannerStat label="Notés" value={String(gradedIds.size)} hint="voir dans Mes notes" />
              <BannerStat
                label={isExam ? "Passés" : "Échéance passée"}
                value={String(pastCount)}
                hint={isExam ? "pas encore notés" : "date dépassée"}
              />
            </div>
          </div>
          <div className="lg:col-span-5">
            <NextCard item={next} isExam={isExam} />
          </div>
        </div>
        <div className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </section>

      <DevoirsClearList
        items={items}
        gradedIds={gradedIds}
        isExam={isExam}
        isLoading={isLoading}
        emptyMessage={isExam ? "Aucun devoir confirmé pour le moment." : "Aucun exercice de maison pour le moment."}
        hint={
          isExam
            ? "Seuls les devoirs confirmés apparaissent ici, avec date et créneau. Les notes sont dans « Mes notes » — rien n’est à rendre en ligne."
            : "Rappel de ce qu’il faut préparer pour la classe. Rien n’est à rendre en ligne ; les notes apparaissent dans « Mes notes »."
        }
      />
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

/** White card in the banner: the next item still to do, like "Prochain cours" on the home. */
function NextCard({ item, isExam }: { item: DevoirListItem | null; isExam: boolean }) {
  if (!item) {
    return (
      <div className="rounded-md bg-white/10 p-5 ring-1 ring-white/15">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
          {isExam ? "Prochain devoir" : "Prochain exercice"}
        </p>
        <p className="mt-2 text-lg font-semibold">Rien de prévu pour le moment</p>
      </div>
    );
  }
  const d = daysUntil(item.eval_date);
  const countdown = d === 0 ? "Aujourd’hui" : d === 1 ? "Demain" : `Dans ${d} jours`;
  const slot = isExam
    ? formatExamSchedule({ due_date: item.eval_date, start_time: item.start_time, end_time: item.end_time })
    : null;
  return (
    <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-800">
          <CalendarClock className="h-3 w-3" />
          {isExam ? "Prochain devoir" : "Prochain exercice"}
        </span>
        <span
          className={cn(
            "text-xs font-bold",
            d != null && d <= 1 ? "text-rose-600" : "text-slate-500",
          )}
        >
          {countdown}
        </span>
      </div>
      <p className="mt-3 truncate text-xl font-bold text-slate-900">{item.title}</p>
      <p className="mt-0.5 text-sm text-slate-500">
        {[
          item.matieres?.name,
          item.eval_date ? `pour le ${formatDateSafe(item.eval_date, "EEEE d MMMM", { locale: fr })}` : null,
          slot,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

export function MesExercicesPage() {
  return <MesDevoirs isExam={false} />;
}

export function MesExamensPage() {
  return <MesDevoirs isExam />;
}
