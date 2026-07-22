import { useQuery } from "@tanstack/react-query";
import { isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { Evaluation } from "@/lib/types";
import { joinOne } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

type EvalRow = Evaluation & {
  matieres: { name: string } | null;
};

type Props = {
  isExam: boolean;
};

export default function MesDevoirs({ isExam }: Props) {
  const { user } = useAuth();

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

      if (!enrollment) return { className: "", items: [] as EvalRow[], gradedIds: [] as string[] };

      const row = enrollment as {
        class_section_id: string;
        classes: unknown;
      };
      const className = joinOne<{ name: string }>(row.classes)?.name ?? "";

      let q = supabase
        .from("evaluations")
        .select("*, matieres(name)")
        .eq("class_section_id", row.class_section_id)
        .eq("type", isExam ? "examen" : "devoir")
        .order("eval_date", { ascending: true });

      // Students only see exams confirmed by the school admin.
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
        items: (rows ?? []) as EvalRow[],
        gradedIds: [...gradedIds],
      };
    },
  });

  const items = data?.items ?? [];
  const className = data?.className ?? "";
  const gradedIds = new Set(data?.gradedIds ?? []);

  return (
    <div>
      <PageHeader
        title={isExam ? "Mes devoirs" : "Mes exercices de maison"}
        subtitle={
          isExam
            ? "Devoirs confirmés par l’établissement"
            : "Les travaux à faire à la maison — à titre indicatif"
        }
      />

      <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        {isExam
          ? "Seuls les devoirs confirmés par l’administration apparaissent ici, avec leur date et créneau. Les notes sont dans « Mes notes »."
          : "Cette page vous rappelle ce qui est à faire et pour quand. Apportez / présentez l’exercice en classe à la date indiquée — rien n’est à rendre en ligne. Les notes, une fois données, apparaissent dans « Mes notes »."}
      </p>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : items.length === 0 ? (
        <EmptyState
          message={
            isExam
              ? "Aucun devoir confirmé pour le moment."
              : "Aucun exercice de maison pour le moment."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => {
            const dueAt = parseValidDate(
              a.eval_date?.length === 10
                ? `${a.eval_date}T23:59:59`
                : a.eval_date,
            );
            const graded = gradedIds.has(a.id);
            const passed = !!dueAt && isPast(dueAt);
            const schedule = formatExamSchedule({
              due_date: a.eval_date,
              start_time: a.start_time,
              end_time: a.end_time,
            });
            const subjectName = a.matieres?.name ?? "Matière";
            const badgeTone = graded
              ? "success"
              : passed
                ? "info"
                : isExam
                  ? "warning"
                  : "success";
            const badgeLabel = graded
              ? "Noté"
              : passed
                ? "Passé"
                : isExam
                  ? "À venir"
                  : "À faire";
            return (
              <Card key={a.id} className="h-full">
                <div className="flex h-full flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        {className ? (
                          <>
                            {className}
                            <span className="font-normal text-slate-400">
                              {" "}
                              ·{" "}
                            </span>
                          </>
                        ) : null}
                        {subjectName}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {a.title}
                      </p>
                    </div>
                    <Badge tone={badgeTone}>{badgeLabel}</Badge>
                  </div>
                  {a.description ? (
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                      {a.description}
                    </p>
                  ) : null}
                  {a.eval_date ? (
                    <p className="mt-auto text-sm text-slate-600 dark:text-slate-300">
                      {graded
                        ? "Date : "
                        : isExam
                          ? "Date : "
                          : "À rendre le "}
                      {formatDateSafe(a.eval_date, "EEE d MMM yyyy", {
                        locale: fr,
                      })}
                      {isExam && schedule ? (
                        <span className="font-medium"> · {schedule}</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MesExercicesPage() {
  return <MesDevoirs isExam={false} />;
}

export function MesExamensPage() {
  return <MesDevoirs isExam />;
}
