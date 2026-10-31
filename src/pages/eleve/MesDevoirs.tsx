import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useExercicesPendingChanges } from "@/hooks/useExamRealtime";
import { supabase } from "@/lib/supabase";
import { joinProfile } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import {
  DevoirsClearList,
  type DevoirListItem,
} from "@/components/DevoirsClearList";

type Props = {
  isExam: boolean;
};

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

      const row = enrollment as {
        class_section_id: string;
        classes: unknown;
      };
      const className =
        joinProfile<{ name: string }>(row.classes)?.name ?? "";

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

  return (
    <div>
      <PageHeader
        title={isExam ? "Mes devoirs" : "Mes exercices de maison"}
        subtitle={
          className
            ? isExam
              ? `Classe ${className} · confirmés par l’établissement`
              : `Classe ${className} · à faire à la maison`
            : isExam
              ? "Devoirs confirmés par l’établissement"
              : "Travaux à faire à la maison"
        }
      />

      <DevoirsClearList
        items={items}
        gradedIds={gradedIds}
        isExam={isExam}
        isLoading={isLoading}
        emptyMessage={
          isExam
            ? "Aucun devoir confirmé pour le moment."
            : "Aucun exercice de maison pour le moment."
        }
        hint={
          isExam
            ? "Seuls les devoirs confirmés apparaissent ici, avec date et créneau. Les notes sont dans « Mes notes » — rien n’est à rendre en ligne."
            : "Rappel de ce qu’il faut préparer pour la classe. Rien n’est à rendre en ligne ; les notes apparaissent dans « Mes notes »."
        }
      />
    </div>
  );
}

export function MesExercicesPage() {
  return <MesDevoirs isExam={false} />;
}

export function MesExamensPage() {
  return <MesDevoirs isExam />;
}
