import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useExercicesPendingChanges } from "@/hooks/useExamRealtime";
import { type DevoirListItem } from "@/components/DevoirsClearList";
import { DevoirsView } from "@/pages/eleve/MesDevoirs";
import {
  useChildEnrollment,
  useParentChildLink,
  useParentChildParams,
} from "@/pages/parent/parentChildAccess";
import { ParentChildGate } from "@/pages/parent/ParentChildGate";

type Props = {
  isExam: boolean;
};

export default function EnfantDevoirs({ isExam }: Props) {
  const id = useParentChildParams();
  const { data: link, isLoading: linkLoading } = useParentChildLink(id);
  const { data: enrollment } = useChildEnrollment(id, !!link);
  const { markSeen: markExercicesSeen } = useExercicesPendingChanges();

  useEffect(() => {
    if (!isExam) markExercicesSeen();
  }, [isExam, markExercicesSeen]);

  const { data, isLoading } = useQuery({
    queryKey: ["enfant-devoirs", id, isExam],
    enabled: !!id && !!link && !!enrollment?.class_section_id,
    queryFn: async () => {
      const classId = enrollment!.class_section_id;
      const className = enrollment!.classes?.name ?? "";

      let q = supabase
        .from("evaluations")
        .select("*, matieres(name)")
        .eq("class_section_id", classId)
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
          .eq("student_id", id!)
          .in("evaluation_id", evalIds);
        gradedIds = new Set(
          (graded ?? [])
            .map((n) => (n as { evaluation_id: string | null }).evaluation_id)
            .filter((eid): eid is string => !!eid),
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
  const className = data?.className ?? enrollment?.classes?.name ?? "";
  const gradedIds = new Set(data?.gradedIds ?? []);

  return (
    <ParentChildGate link={link} isLoading={linkLoading}>
      {!enrollment && !linkLoading && !isLoading ? (
        <p className="text-sm text-slate-500">Cet élève n’est pas encore inscrit dans une classe.</p>
      ) : (
        <DevoirsView
          items={items}
          gradedIds={gradedIds}
          isLoading={linkLoading || isLoading}
          isExam={isExam}
          className={className}
          childFirstName={link?.profils?.first_name ?? null}
        />
      )}
    </ParentChildGate>
  );
}

export function EnfantExercicesPage() {
  return <EnfantDevoirs isExam={false} />;
}

export function EnfantExamensPage() {
  return <EnfantDevoirs isExam />;
}
