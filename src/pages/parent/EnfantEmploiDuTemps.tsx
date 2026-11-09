import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import { dbDayOfWeek } from "@/lib/timetableSchedule";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { ParentChildSwitcher } from "@/components/ParentChildSwitcher";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import {
  ParentChildBackLink,
  ParentChildGate,
  childDisplayName,
  useChildEnrollment,
  useParentChildLink,
  useParentChildParams,
} from "@/pages/parent/parentChildAccess";

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
      <div>
        <ParentChildBackLink childName={childName} />
        <PageHeader
          title={
            childName
              ? `Emploi du temps — ${childName}`
              : "Emploi du temps"
          }
          subtitle={
            enrollment?.classes?.name
              ? `Classe ${enrollment.classes.name} · lundi → samedi`
              : "Planning de la classe"
          }
          belowTitle={<ParentChildSwitcher />}
          actions={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isLoading || slots.length === 0 || exporting}
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Export…" : "Télécharger PDF"}
            </Button>
          }
        />

        {linkLoading || isLoading ? (
          <p className="text-slate-500">Chargement…</p>
        ) : !enrollment ? (
          <EmptyState message="Cet élève n’est pas encore inscrit dans une classe." />
        ) : slots.length === 0 ? (
          <EmptyState message="Aucun créneau planifié pour cette classe." />
        ) : (
          <TimetableGrid
            slots={gridSlots}
            title="Planning hebdomadaire"
            highlightDay={dbDayOfWeek()}
          />
        )}
      </div>
    </ParentChildGate>
  );
}
