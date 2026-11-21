import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { WeekGrid, type Slot } from "@/pages/eleve/MonEmploiDuTemps";
import { todayDow, useNow, useWeekLayout } from "@/lib/weekGrid";
import {
  childDisplayName,
  useChildEnrollment,
  useParentChildLink,
  useParentChildParams,
} from "@/pages/parent/parentChildAccess";
import { ParentChildGate } from "@/pages/parent/ParentChildGate";

export default function EnfantEmploiDuTemps() {
  const id = useParentChildParams();
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const [exporting, setExporting] = useState(false);
  const { markSeen } = useEdtPendingChanges();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const { data: link, isLoading: linkLoading } = useParentChildLink(id);
  const child = link?.profils;
  const childName = childDisplayName(child);

  const { data: enrollment } = useChildEnrollment(id, !!link);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["enfant-edt", id],
    enabled: !!id && !!link && !!enrollment?.class_section_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, matieres(name), profils(first_name, last_name)")
        .eq("class_section_id", enrollment!.class_section_id)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as (TimetableSlot & {
        matieres: { name: string } | null;
        profils: { first_name: string; last_name: string } | null;
      })[];
    },
  });

  const now = useNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayDow(now);
  const { byDay, bounds } = useWeekLayout(slots as Slot[]);
  const noChanges = useMemo(() => new Set<string>(), []);

  const handleDownload = () => {
    if (slots.length === 0) {
      toast.message("Aucun créneau à exporter");
      return;
    }
    setExporting(true);
    try {
      const doc = generateEmploiDuTempsPdf({
        schoolName: school?.name ?? "École",
        studentName: childName ?? "Élève",
        className: enrollment?.classes?.name ?? "—",
        slots: slots.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          subjectName: s.matieres?.name ?? "Matière",
          teacherName: s.profils
            ? fullName(s.profils.first_name, s.profils.last_name)
            : null,
          room: s.room,
        })),
      });
      const safe =
        (childName ?? "eleve")
          .replace(/\s+/g, "-")
          .replace(/[^\w\-àâäéèêëïîôùûüç]/gi, "") || "eleve";
      doc.save(`emploi-du-temps-${safe}.pdf`);
      toast.success("Emploi du temps téléchargé");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Téléchargement impossible",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <ParentChildGate link={link} isLoading={linkLoading}>
      <div className="space-y-5">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
              {child?.first_name ? `Emploi du temps de ${child.first_name}` : "Emploi du temps"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {enrollment?.classes?.name ? `Classe ${enrollment.classes.name} · ` : ""}du lundi au samedi · mis à jour en
              direct
            </p>
          </div>
          <button
            type="button"
            disabled={isLoading || slots.length === 0 || exporting}
            onClick={handleDownload}
            className="inline-flex items-center gap-2 self-start rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 md:self-auto dark:border-white/10 dark:text-slate-200"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Export…" : "Télécharger PDF"}
          </button>
        </header>

        {linkLoading || isLoading ? (
          <div className="h-[36rem] animate-pulse rounded-lg bg-slate-100" aria-busy="true" aria-label="Chargement" />
        ) : !enrollment ? (
          <EmptyState message="Cet élève n’est pas encore inscrit dans une classe." />
        ) : slots.length === 0 ? (
          <EmptyState message="Aucun créneau planifié pour cette classe." />
        ) : (
          <WeekGrid byDay={byDay} bounds={bounds} today={today} nowMin={nowMin} changedIds={noChanges} />
        )}
      </div>
    </ParentChildGate>
  );
}
