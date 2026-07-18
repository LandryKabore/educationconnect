import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { Button, EmptyState, PageHeader } from "@/components/ui";

export default function MonEmploiDuTemps() {
  const { user } = useAuth();
  const { pending, pendingCount, markSeen } = useEdtPendingChanges();
  const [showChanges, setShowChanges] = useState(false);

  useEffect(() => {
    if (pendingCount > 0) setShowChanges(true);
  }, [pendingCount]);

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

  const highlightIds = useMemo(
    () =>
      pending
        .filter((c) => c.kind !== "removed")
        .map((c) => c.slotId),
    [pending],
  );

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

  const dismissChanges = () => {
    markSeen();
    setShowChanges(false);
  };

  return (
    <div>
      <PageHeader
        title="Mon emploi du temps"
        subtitle="Planning de la semaine (lundi → samedi) · mise à jour en direct"
      />

      {showChanges && pending.length > 0 ? (
        <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Nouveautés sur ton emploi du temps
              </p>
              <p className="mt-0.5 text-xs text-brand-800/90">
                {pending.length} modification
                {pending.length > 1 ? "s" : ""} depuis ta dernière visite
              </p>
              <ul className="mt-3 space-y-1.5">
                {pending.map((c) => (
                  <li
                    key={c.id}
                    className="text-sm text-slate-800 dark:text-slate-100"
                  >
                    <span className="font-semibold text-brand-700">
                      {c.kind === "added"
                        ? "Ajouté"
                        : c.kind === "removed"
                          ? "Supprimé"
                          : "Modifié"}
                      {" · "}
                    </span>
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={dismissChanges}
            >
              J’ai vu
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau planifié." />
      ) : (
        <TimetableGrid slots={gridSlots} highlightIds={highlightIds} />
      )}
    </div>
  );
}
