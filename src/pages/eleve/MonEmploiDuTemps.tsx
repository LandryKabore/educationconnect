import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatDay } from "@/lib/pdfBulletin";
import type { TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";

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
        .eq("class_section_id", (enrollment as { class_section_id: string }).class_section_id)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as (TimetableSlot & {
        matieres: { name: string };
        profils: { first_name: string; last_name: string } | null;
      })[];
    },
  });

  const byDay = slots.reduce<Record<number, typeof slots>>((acc, slot) => {
    const d = slot.day_of_week;
    if (!acc[d]) acc[d] = [];
    acc[d].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Mon emploi du temps" subtitle="Planning hebdomadaire" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau planifié." />
      ) : (
        <div className="space-y-6">
          {[1, 2, 3, 4, 5, 6, 7]
            .filter((d) => byDay[d]?.length)
            .map((day) => (
              <div key={day}>
                <h2 className="mb-2 font-semibold text-brand-700">{formatDay(day)}</h2>
                <div className="space-y-2">
                  {byDay[day].map((slot) => (
                    <Card key={slot.id} className="flex flex-wrap justify-between gap-2 py-3">
                      <div>
                        <p className="font-medium">{slot.matieres?.name}</p>
                        {slot.profils ? (
                          <p className="text-sm text-slate-500">
                            {fullName(slot.profils.first_name, slot.profils.last_name)}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <p>
                          {slot.start_time?.slice(0, 5)} — {slot.end_time?.slice(0, 5)}
                        </p>
                        {slot.room ? <p>Salle {slot.room}</p> : null}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
