import { useQuery } from "@tanstack/react-query";
import { isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignmentKindEmpty,
  assignmentKindLabel,
  formatExamSchedule,
  type AssignmentKind,
} from "@/lib/assignmentKinds";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { Assignment } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

type DevoirRow = Assignment & {
  matieres: { name: string } | null;
};

type Props = {
  kind: AssignmentKind;
};

export default function MesDevoirs({ kind }: Props) {
  const { user } = useAuth();
  const isExam = kind === "examen";

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["mes-devoirs", user?.id, kind],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (!enrollment) return [];

      let q = supabase
        .from("devoirs")
        .select("*, matieres(name)")
        .eq(
          "class_section_id",
          (enrollment as { class_section_id: string }).class_section_id,
        )
        .eq("kind", kind)
        .order("due_date", { ascending: true });

      // Students only see exams confirmed by the school admin.
      if (isExam) q = q.eq("admin_confirmed", true);

      const { data, error } = await q;
      if (error) throw error;
      return data as DevoirRow[];
    },
  });

  return (
    <div>
      <PageHeader
        title={isExam ? "Mes examens" : "Mes exercices de maison"}
        subtitle={
          isExam
            ? "Examens confirmés par l’établissement"
            : "Les travaux à faire à la maison — à titre indicatif"
        }
      />

      <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        {isExam
          ? "Seuls les examens confirmés par l’administration apparaissent ici, avec leur date et créneau. Les notes sont dans « Mes notes »."
          : "Cette page vous rappelle ce qui est à faire et pour quand. Rien n’est à rendre en ligne."}
      </p>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : assignments.length === 0 ? (
        <EmptyState
          message={
            isExam
              ? "Aucun examen confirmé pour le moment."
              : assignmentKindEmpty(kind)
          }
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const dueAt = parseValidDate(
              a.due_date?.length === 10 ? `${a.due_date}T23:59:59` : a.due_date,
            );
            const passed = !!dueAt && isPast(dueAt);
            const schedule = formatExamSchedule({
              due_date: a.due_date,
              start_time: a.start_time,
              end_time: a.end_time,
            });
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-sm text-slate-500">
                      {a.matieres?.name ?? "—"}
                      {" · "}
                      {assignmentKindLabel(kind)}
                    </p>
                  </div>
                  <Badge tone={passed ? "info" : isExam ? "warning" : "success"}>
                    {passed ? "Passé" : isExam ? "À venir" : "À faire"}
                  </Badge>
                </div>
                {a.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                    {a.description}
                  </p>
                ) : null}
                {a.due_date ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {isExam ? "Date : " : "À faire pour le "}
                    {formatDateSafe(a.due_date, "EEEE d MMMM yyyy", {
                      locale: fr,
                    })}
                    {isExam && schedule ? (
                      <span className="font-medium"> · {schedule}</span>
                    ) : null}
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MesExercicesPage() {
  return <MesDevoirs kind="exercice_maison" />;
}

export function MesExamensPage() {
  return <MesDevoirs kind="examen" />;
}
