import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { EmptyState, PageHeader } from "@/components/ui";

export default function MonEmploiDuTemps() {
  const { user } = useAuth();

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["mon-edt", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (!enrollment) return [];

      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, matieres(name), profils(first_name, last_name)")
        .eq(
          "class_section_id",
          (enrollment as { class_section_id: string }).class_section_id,
        )
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as (TimetableSlot & {
        matieres: { name: string };
        profils: { first_name: string; last_name: string } | null;
      })[];
    },
  });

  const gridSlots: TimetableGridSlot[] = useMemo(
    () =>
      slots.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        subjectName: s.matieres?.name ?? "Matière",
        teacherName: s.profils
          ? fullName(s.profils.first_name, s.profils.last_name)
          : null,
        room: s.room,
      })),
    [slots],
  );

  return (
    <div>
      <PageHeader title="Mon emploi du temps" subtitle="Planning hebdomadaire" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau planifié." />
      ) : (
        <TimetableGrid slots={gridSlots} />
      )}
    </div>
  );
}
