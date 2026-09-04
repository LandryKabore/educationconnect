import { useQuery } from "@tanstack/react-query";
import { isPast, isWithinInterval, parseISO, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

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
    return { label: "En cours", tone: "warning" as const };
  }
  if (isPast(end)) {
    return { label: "Terminée", tone: "info" as const };
  }
  return { label: "À venir", tone: "success" as const };
}

export default function MesCompositions() {
  const { user } = useAuth();

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

      const classId = (enrollment as { class_section_id: string })
        .class_section_id;

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
        .select(
          "id, session_id, eval_date, start_time, end_time, matieres(name)",
        )
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

      return list.map(
        (s): SessionRow => ({
          ...s,
          papers: bySession.get(s.id) ?? [],
        }),
      );
    },
  });

  return (
    <div>
      <PageHeader
        title="Mes compositions"
        subtitle="Programme des compositions planifiées par l’établissement"
      />

      <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        Chaque composition regroupe les épreuves de votre classe (matière, date
        et horaire). Les notes apparaissent dans « Mes notes » une fois
        saisies.
      </p>

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
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                          {session.title}
                        </h3>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {session.period_label}
                        <span> · </span>
                        {formatDateSafe(session.starts_on, "d MMM", {
                          locale: fr,
                        })}
                        {" – "}
                        {formatDateSafe(session.ends_on, "d MMM yyyy", {
                          locale: fr,
                        })}
                        <span> · </span>
                        {session.papers.length} épreuve
                        {session.papers.length !== 1 ? "s" : ""}
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
                          <li
                            key={paper.id}
                            className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                          >
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
                    <p className="mt-3 text-sm text-slate-500">
                      Programme des épreuves à venir.
                    </p>
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
