import { useEffect, useRef, useState } from "react";
import { RollCall } from "@/components/RollCall";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useActingTeacherId } from "@/hooks/useActingTeacherId";
import { supabase } from "@/lib/supabase";
import type { Subject } from "@/lib/types";
import { formatDateSafe } from "@/lib/dateFr";
import { UNSAVED_ROLLCALL_MESSAGE } from "@/hooks/useUnsavedChangesGuard";
import { BackLink, Card, EmptyState, Input, Label, Select } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";

function initialDate(param: string | null) {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
  return format(new Date(), "yyyy-MM-dd");
}

export default function Presences() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const { actingTeacherId, isProxy, proxyTeacherId } = useActingTeacherId();
  const isAdmin = role === "school_admin";
  /** Admin acting for a specific teacher — behave like that teacher for subjects. */
  const asTeacher = !isAdmin || isProxy;
  const [date, setDate] = useState(() => initialDate(searchParams.get("date")));
  /** Only used when the teacher teaches several subjects in this class (or admin). */
  const [subjectOverride, setSubjectOverride] = useState(
    () => searchParams.get("matiere") ?? "",
  );
  /** Set below once the taps are known; lets the date / subject handlers ask « unsaved taps? ». */
  const unsavedRef = useRef(false);
  const hasUnsavedTaps = () => unsavedRef.current;

  const onDateChange = (next: string) => {
    if (next === date) return;
    if (hasUnsavedTaps() && !window.confirm(UNSAVED_ROLLCALL_MESSAGE)) return;
    setDate(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("date", next);
        return p;
      },
      { replace: true },
    );
  };

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ["presence-subjects", id, actingTeacherId, isAdmin, isProxy],
    enabled: !!id && !!actingTeacherId,
    queryFn: async () => {
      let q = supabase
        .from("affectations_enseignement")
        .select("matieres(*)")
        .eq("class_section_id", id!);
      // Teacher or admin saisie → only that teacher's matière(s).
      if (asTeacher) q = q.eq("teacher_id", actingTeacherId!);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, Subject>();
      for (const row of data ?? []) {
        const sub = (row as unknown as { matieres: Subject | null }).matieres;
        if (sub) map.set(sub.id, sub);
      }
      return [...map.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );
    },
  });

  // Auto: the subject this teacher teaches here (no picker when only one).
  const needsSubjectPicker = (isAdmin && !isProxy) || subjects.length > 1;
  const subjectId = needsSubjectPicker
    ? subjectOverride || subjects[0]?.id || ""
    : subjects[0]?.id || "";

  useEffect(() => {
    if (!needsSubjectPicker) return;
    if (!subjectOverride && subjects[0]?.id) {
      setSubjectOverride(subjects[0].id);
    }
  }, [needsSubjectPicker, subjectOverride, subjects]);

  const selectedSubject = subjects.find((s) => s.id === subjectId);

  const { data: className } = useQuery({
    queryKey: ["class-name", id],
    enabled: !!id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("name").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as { name: string } | null)?.name ?? null;
    },
  });

  return (
    <div className="pb-28 lg:pb-0">
      <BackLink
        preferHistory={!isProxy}
        to={
          isProxy
            ? `/saisie-enseignant?teacherId=${encodeURIComponent(proxyTeacherId!)}`
            : isAdmin
              ? `/classes/${id}`
              : `/presences`
        }
        label={isProxy ? "Retour à la saisie enseignant" : isAdmin ? "Retour à la classe" : "Retour aux présences"}
      />

      <PageBanner
        title={className ? `Appel · ${className}` : "Appel"}
        subtitle={[
          selectedSubject?.name,
          formatDateSafe(date, "EEEE d MMMM", { locale: fr }),
          "tous présents par défaut, touchez seulement les absents et les retards",
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className="mb-4 grid gap-3 sm:max-w-xl sm:grid-cols-2">
        <Card className="py-3">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {formatDateSafe(date, "EEEE d MMMM yyyy", { locale: fr })}
            {selectedSubject && !needsSubjectPicker
              ? ` · ${selectedSubject.name}`
              : ""}
          </p>
        </Card>

        {needsSubjectPicker && subjects.length > 0 ? (
          <Card className="py-3">
            <Label htmlFor="presence-matiere">Matière</Label>
            <Select
              id="presence-matiere"
              value={subjectId}
              onChange={(e) => {
                if (hasUnsavedTaps() && !window.confirm(UNSAVED_ROLLCALL_MESSAGE)) return;
                setSubjectOverride(e.target.value);
                setSearchParams(
                  (prev) => {
                    const p = new URLSearchParams(prev);
                    if (e.target.value) p.set("matiere", e.target.value);
                    else p.delete("matiere");
                    return p;
                  },
                  { replace: true },
                );
              }}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Card>
        ) : null}
      </div>

      {subjectsLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : subjects.length === 0 ? (
        <EmptyState
          message={
            isAdmin
              ? "Aucune matière enseignée dans cette classe."
              : "Vous n’avez pas de matière assignée dans cette classe."
          }
        />
      ) : !subjectId ? (
        <EmptyState message="Choisissez une matière pour prendre les présences." />
      ) : (
        <RollCall
          classId={id!}
          subjectId={subjectId}
          date={date}
          onDirtyChange={(dirty) => {
            unsavedRef.current = dirty;
          }}
        />
      )}
    </div>
  );
}
