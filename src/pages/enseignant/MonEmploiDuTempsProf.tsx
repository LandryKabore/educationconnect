import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import {
  computeScheduleFocus,
  dbDayOfWeek,
  WEEKDAY_LABELS,
} from "@/lib/timetableSchedule";
import { supabase } from "@/lib/supabase";
import type { TimetableSlot } from "@/lib/types";
import { cn, personName } from "@/lib/utils";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { Button, EmptyState, PageHeader } from "@/components/ui";

type SlotRow = TimetableSlot & {
  matieres: { name: string } | null;
  classes: { name: string } | null;
};

export default function MonEmploiDuTempsProf() {
  const { user, profile, schoolId, schools } = useAuth();
  const qc = useQueryClient();
  const school = schools.find((s) => s.id === schoolId);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!schoolId || !user?.id) return;

    const channel = supabase
      .channel(`edt-teacher:${user.id}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creneaux_edt",
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["mon-edt-prof", user.id] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [schoolId, user?.id, qc]);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["mon-edt-prof", user?.id],
    enabled: !!user?.id && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, matieres(name), classes!inner(name, school_id)")
        .eq("teacher_id", user!.id)
        .eq("classes.school_id", schoolId!)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as SlotRow[];
    },
  });

  const gridSlots: TimetableGridSlot[] = useMemo(
    () =>
      slots.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        subjectName: [s.classes?.name, s.matieres?.name]
          .filter(Boolean)
          .join(" · "),
        className: s.classes?.name ?? "Classe",
        room: s.room,
      })),
    [slots],
  );

  const todayDow = dbDayOfWeek();
  const todaySlots = useMemo(
    () => slots.filter((s) => s.day_of_week === todayDow),
    [slots, todayDow],
  );

  const scheduleFocus = useMemo(() => computeScheduleFocus(slots), [slots]);

  const handleDownload = () => {
    if (slots.length === 0) {
      toast.message("Aucun créneau à exporter");
      return;
    }
    setExporting(true);
    try {
      const teacherName = profile
        ? personName(profile.first_name, profile.last_name) || "Enseignant"
        : "Enseignant";
      const doc = generateEmploiDuTempsPdf({
        schoolName: school?.name ?? "École",
        className: "Mes cours",
        extraLine: `Enseignant : ${teacherName}`,
        slots: slots.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          subjectName: s.matieres?.name ?? "Matière",
          teacherName: s.classes?.name ?? null,
          room: s.room,
        })),
      });
      const safeName = teacherName
        .replace(/\s+/g, "-")
        .replace(/[^\w\-àâäéèêëïîôùûüç]/gi, "");
      doc.save(`emploi-du-temps-${safeName || "enseignant"}.pdf`);
      toast.success("Emploi du temps téléchargé");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Téléchargement impossible",
      );
    } finally {
      setExporting(false);
    }
  };

  const focusClass = scheduleFocus
    ? (scheduleFocus.slot as SlotRow).classes?.name
    : null;
  const focusSubject = scheduleFocus
    ? (scheduleFocus.slot as SlotRow).matieres?.name
    : null;

  return (
    <div>
      <PageHeader
        title="Mon emploi du temps"
        subtitle="Vos cours de la semaine (lundi → samedi) · mise à jour en direct"
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

      {scheduleFocus ? (
        <div className="mb-5 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/40 dark:bg-brand-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-900 dark:text-brand-100">
                {scheduleFocus.kind === "current"
                  ? "Cours en cours"
                  : scheduleFocus.isLaterDay
                    ? `Prochain cours · ${scheduleFocus.dayLabel}`
                    : "Prochain cours"}
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                {[focusClass, focusSubject].filter(Boolean).join(" · ") ||
                  "Cours"}
              </p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                {scheduleFocus.slot.start_time?.slice(0, 5)}
                {scheduleFocus.slot.end_time
                  ? `–${scheduleFocus.slot.end_time.slice(0, 5)}`
                  : ""}
                {scheduleFocus.slot.room
                  ? ` · Salle ${scheduleFocus.slot.room}`
                  : ""}
              </p>
            </div>
            {scheduleFocus.kind === "current" ? (
              <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                En cours
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau planifié pour vous. L’administration peut vous affecter des cours dans l’emploi du temps." />
      ) : (
        <>
          {todaySlots.length > 0 ? (
            <div className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Aujourd’hui · {WEEKDAY_LABELS[todayDow]}
              </h2>
              <ul className="space-y-2">
                {todaySlots.map((s) => {
                  const isFocus = scheduleFocus?.slot.id === s.id;
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5",
                        isFocus
                          ? "bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-950/40 dark:ring-brand-700"
                          : "bg-slate-50 dark:bg-[var(--surface-2)]",
                      )}
                    >
                      <span
                        className={cn(
                          "w-24 shrink-0 text-xs font-semibold tabular-nums",
                          isFocus ? "text-brand-800" : "text-slate-600",
                        )}
                      >
                        {s.start_time?.slice(0, 5)}
                        {s.end_time ? `–${s.end_time.slice(0, 5)}` : ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {[s.classes?.name, s.matieres?.name]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {s.room ? (
                          <p className="text-xs text-slate-500">
                            Salle {s.room}
                          </p>
                        ) : null}
                      </div>
                      {isFocus ? (
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          {scheduleFocus?.kind === "current"
                            ? "En cours"
                            : "Prochain"}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : scheduleFocus?.isLaterDay ? (
            <p className="mb-5 text-sm text-slate-500">
              Pas de cours aujourd’hui — le prochain est{" "}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {scheduleFocus.dayLabel.toLowerCase()}
              </span>
              .
            </p>
          ) : null}

          <TimetableGrid
            slots={gridSlots}
            title="Planning hebdomadaire"
          />
        </>
      )}

      {slots.length > 0 ? (
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link
            to="/tableau-de-bord"
            className="font-medium text-brand-700 hover:underline dark:text-brand-300"
          >
            Retour au tableau de bord
          </Link>
        </p>
      ) : null}
    </div>
  );
}
