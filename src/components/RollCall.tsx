import { useEffect, useMemo, useState } from "react";
import { ReadOnlyBanner, useModuleReadOnly } from "@/components/ReadOnlyBanner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckCircle2, Clock, Lock, Search, TriangleAlert, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActingTeacherId } from "@/hooks/useActingTeacherId";
import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, Profile } from "@/lib/types";
import { cn, fullName, joinProfile, matchesSearch } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";

/**
 * Roll call = « everyone present, tap only the exceptions ».
 * The « present » of a student nobody touched is only a DRAFT on this screen:
 * nothing is written to the database until the teacher presses « Valider l'appel »,
 * so a forgotten roll call never turns into 50 false « present » rows.
 * Used by the class roll-call page and by the lesson workspace.
 */
type StatusValue = AttendanceStatus;

const ROLL_BUTTONS: { status: "present" | "absent" | "late"; label: string; icon: typeof Check }[] = [
  { status: "present", label: "Présent", icon: Check },
  { status: "absent", label: "Absent", icon: X },
  { status: "late", label: "Retard", icon: Clock },
];

/** P / A / R as one segmented control on each student tile. */
function segmentClass(status: "present" | "absent" | "late", active: boolean) {
  const base =
    "inline-flex h-9 items-center justify-center gap-1.5 border-l border-slate-200 px-2 text-sm font-semibold transition first:border-l-0 dark:border-[var(--border)]";
  if (!active) return `${base} bg-white text-slate-500 hover:bg-slate-50 dark:bg-[var(--surface)] dark:text-slate-300`;
  if (status === "present") return `${base} bg-emerald-600 text-white`;
  if (status === "absent") return `${base} bg-rose-600 text-white`;
  return `${base} bg-amber-500 text-white`;
}

function initials(first?: string | null, last?: string | null) {
  return `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase() || "?";
}

export function RollCall({
  classId,
  subjectId,
  date,
  onSaved,
  onDirtyChange,
}: {
  classId: string;
  subjectId: string;
  date: string;
  /** called after a successful « Valider / Mettre à jour l'appel » */
  onSaved?: () => void;
  /** tells the parent whether there are unsaved taps */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { user, role } = useAuth();
  const { actingTeacherId, isProxy } = useActingTeacherId();
  const qc = useQueryClient();
  const isAdmin = role === "school_admin";
  const readOnly = useModuleReadOnly("presences");
  const asTeacher = !isAdmin || isProxy;
  const [saving, setSaving] = useState(false);

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["class-roster", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select(
          "student_id, profils:profils!inscriptions_student_id_fkey(*)",
        )
        .eq("class_section_id", classId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id)
        .sort((a, b) =>
          fullName(a.first_name, a.last_name).localeCompare(
            fullName(b.first_name, b.last_name),
            "fr",
          ),
        );
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["presences", classId, date, subjectId],
    enabled: !!classId && !!subjectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("presences")
        .select("*")
        .eq("class_section_id", classId)
        .eq("date", date)
        .eq("subject_id", subjectId);
      return data ?? [];
    },
  });

  const [statuses, setStatuses] = useState<Record<string, StatusValue>>({});
  const [view, setView] = useState<"all" | "absent" | "late">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setStatuses({});
    setSearch("");
  }, [date, classId, subjectId]);

  const savedByStudent = useMemo(() => {
    const map = new Map<
      string,
      { status: AttendanceStatus; note: string | null }
    >();
    for (const a of attendance) {
      const row = a as {
        student_id: string;
        status: AttendanceStatus;
        note: string | null;
      };
      map.set(row.student_id, { status: row.status, note: row.note });
    }
    return map;
  }, [attendance]);

  /** What the screen shows: the teacher's tap, else the saved row, else the « present » draft. */
  const getStatus = (studentId: string): StatusValue => {
    if (Object.prototype.hasOwnProperty.call(statuses, studentId)) {
      return statuses[studentId];
    }
    return savedByStudent.get(studentId)?.status ?? "present";
  };

  /** Students with no saved row yet: their « present » is still only a draft. */
  const draftCount = students.filter((s) => !savedByStudent.has(s.id)).length;
  const validated = students.length > 0 && draftCount === 0;
  const changed = students.some((s) => {
    const saved = savedByStudent.get(s.id);
    return !!saved && getStatus(s.id) !== saved.status;
  });
  const canSubmit = !validated || changed;
  /** The teacher touched at least one student and has not saved it yet. */
  const hasTaps = students.some(
    (s) => getStatus(s.id) !== (savedByStudent.get(s.id)?.status ?? "present"),
  );
  useEffect(() => {
    onDirtyChange?.(hasTaps);
  }, [hasTaps, onDirtyChange]);
  const blocker = useUnsavedChangesGuard(hasTaps);

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const s of students) counts[getStatus(s.id)] += 1;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, statuses, savedByStudent]);

  const visibleStudents = useMemo(() => {
    if (search.trim()) {
      return students.filter((s) =>
        matchesSearch(search, s.first_name, s.last_name),
      );
    }
    if (view === "all") return students;
    if (view === "absent") return students.filter((s) => getStatus(s.id) === "absent");
    return students.filter((s) => getStatus(s.id) === "late");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, search, view, statuses, savedByStudent]);

  const handleSave = async () => {
    if (!classId || !user || !canSubmit) return;
    if (!subjectId) {
      toast.error(
        isAdmin
          ? "Choisissez une matière"
          : "Aucune matière assignée pour cette classe",
      );
      return;
    }

    setSaving(true);
    // Only rows that are new or changed are written: a re-validation never touches
    // the lines already saved (and never an « excused » line set by the school).
    const rows = students
      .filter((student) => {
        const prev = savedByStudent.get(student.id);
        return !prev || getStatus(student.id) !== prev.status;
      })
      .map((student) => ({
        class_section_id: classId,
        student_id: student.id,
        subject_id: subjectId,
        date,
        status: getStatus(student.id),
        note: null as string | null,
        recorded_by: isProxy && actingTeacherId ? actingTeacherId : user.id,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from("presences").upsert(rows, {
        onConflict: "class_section_id,student_id,date,subject_id",
      });
      if (error) {
        toast.error(error.message || "Enregistrement impossible");
        setSaving(false);
        return;
      }
    }
    toast.success(
      validated ? "Appel mis à jour" : `Appel validé — ${students.length} élèves`,
    );
    setStatuses({});
    await qc.invalidateQueries({
      queryKey: ["presences", classId, date, subjectId],
    });
    void qc.invalidateQueries({ queryKey: ["teacher-lessons"] });
    void qc.invalidateQueries({ queryKey: ["teacher-todo"] });
    void qc.invalidateQueries({ queryKey: ["teacher-presences-day"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-presences"] });
    void qc.invalidateQueries({ queryKey: ["mes-presences"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    setSaving(false);
    onSaved?.();
  };


  if (isLoading) return <p className="text-slate-500">Chargement…</p>;
  if (students.length === 0) return <EmptyState message="Aucun élève dans cette classe." />;

  // « everyone present again »: drop the taps, keep what the school justified
  const resetAll = () => {
    const next: Record<string, StatusValue> = {};
    for (const st of students) if (getStatus(st.id) !== "excused") next[st.id] = "present";
    setStatuses(next);
  };
  const pct = students.length ? Math.round(((summary.present + summary.late) / students.length) * 100) : 0;
  const buttonLabel = readOnly
    ? "Consultation seulement"
    : saving
    ? "Enregistrement…"
    : validated
      ? changed
        ? "Mettre à jour l’appel"
        : "Appel validé ✓"
      : "Valider l’appel";

  const counts = (
    <dl className="grid grid-cols-4 gap-2 text-center">
      {(
        [
          ["présents", summary.present, "text-emerald-600"],
          ["absents", summary.absent, "text-rose-600"],
          ["retards", summary.late, "text-amber-600"],
          ["justifiés", summary.excused, "text-sky-600"],
        ] as const
      ).map(([label, n, tone]) => (
        <div key={label} className="rounded-md bg-slate-50 px-1 py-2 dark:bg-[var(--surface-2)]">
          <dd className={cn("text-xl font-bold leading-none tabular-nums", tone)}>{n}</dd>
          <dt className="mt-1 text-[11px] text-slate-500">{label}</dt>
        </div>
      ))}
    </dl>
  );

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      {readOnly ? <ReadOnlyBanner module="presences" /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        {/* ── The class ── */}
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md bg-slate-100 p-0.5 dark:bg-[var(--surface-2)]">
              {(
                [
                  ["all", `Tous (${students.length})`],
                  ["absent", `Absents (${summary.absent})`],
                  ["late", `Retards (${summary.late})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setView(key);
                    setSearch("");
                  }}
                  aria-pressed={view === key && !search.trim()}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm font-semibold transition",
                    view === key && !search.trim()
                      ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                aria-label="Chercher un élève"
                placeholder="Chercher un élève"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                className="h-9 rounded-md pl-9"
              />
            </label>
            {hasTaps ? (
              <button
                type="button"
                onClick={resetAll}
                className="h-9 rounded-md px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]"
              >
                Tous présents
              </button>
            ) : null}
          </div>

          {visibleStudents.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {search.trim()
                  ? "Aucun élève ne correspond à cette recherche."
                  : view === "absent"
                    ? "Aucun absent pour l’instant."
                    : "Aucun retard pour l’instant."}
              </p>
            </Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 min-[1700px]:grid-cols-3">
              {visibleStudents.map((s) => {
                const value = getStatus(s.id);
                const note = savedByStudent.get(s.id)?.note;
                const locked = value === "excused" && (asTeacher || !isAdmin);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex flex-col gap-2.5 rounded-md border bg-white p-3 transition dark:bg-[var(--surface)]",
                      value === "present" && "border-slate-200 dark:border-[var(--border)]",
                      value === "absent" && "border-rose-300 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-950/30",
                      value === "late" && "border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-950/30",
                      value === "excused" && "border-sky-200 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-950/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                        value === "absent"
                          ? "bg-rose-600 text-white"
                          : value === "late"
                            ? "bg-amber-500 text-white"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
                      )}
                    >
                      {initials(s.first_name, s.last_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <PersonName first={s.first_name} last={s.last_name} />
                      </p>
                      {value === "excused" && note ? (
                        <p className="truncate text-xs text-sky-700 dark:text-sky-300">{note}</p>
                      ) : null}
                    </div>
                    {locked ? (
                      <Badge tone="info">
                        <Lock className="mr-1 h-3 w-3" />
                        Justifié
                      </Badge>
                    ) : null}
                    </div>
                    {locked || readOnly ? null : (
                      <div
                        className="grid grid-cols-3 overflow-hidden rounded-md border border-slate-200 dark:border-[var(--border)]"
                        role="group"
                        aria-label={`Présence de ${fullName(s.first_name, s.last_name)}`}
                      >
                        {ROLL_BUTTONS.map((b) => (
                          <button
                            key={b.status}
                            type="button"
                            title={ATTENDANCE_LABELS[b.status]}
                            aria-label={ATTENDANCE_LABELS[b.status]}
                            aria-pressed={value === b.status}
                            className={segmentClass(b.status, value === b.status)}
                            onClick={() => setStatuses((prev) => ({ ...prev, [s.id]: b.status }))}
                          >
                            <b.icon className="h-3.5 w-3.5" aria-hidden />
                            <span>{b.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Summary and validation (laptop: sticky panel) ── */}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <Card className="space-y-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Appel</p>
              <p
                className={cn(
                  "mt-1 inline-flex items-center gap-1.5 text-lg font-bold",
                  validated && !changed ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {validated && !changed ? <CheckCircle2 className="h-5 w-5" /> : <TriangleAlert className="h-5 w-5" />}
                {validated ? (changed ? "Modifications à enregistrer" : "Appel validé") : "Appel non validé"}
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-600">Présence</span>
                <span className="tabular-nums text-slate-900 dark:text-slate-100">{pct} %</span>
              </div>
              <div className="mt-1 flex h-2 overflow-hidden rounded-sm bg-slate-100 dark:bg-[var(--surface-2)]">
                <span className="bg-emerald-500" style={{ width: `${(summary.present / Math.max(1, students.length)) * 100}%` }} />
                <span className="bg-amber-400" style={{ width: `${(summary.late / Math.max(1, students.length)) * 100}%` }} />
                <span className="bg-sky-500" style={{ width: `${(summary.excused / Math.max(1, students.length)) * 100}%` }} />
                <span className="bg-rose-500" style={{ width: `${(summary.absent / Math.max(1, students.length)) * 100}%` }} />
              </div>
            </div>
            {counts}
            <Button type="button" size="lg" className="w-full" disabled={readOnly || saving || !canSubmit || !subjectId} onClick={() => void handleSave()}>
              {buttonLabel}
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">
              {validated
                ? "Vous pouvez encore corriger un élève, puis mettre à jour l’appel."
                : "Tout le monde est présent par défaut : touchez « Absent » ou « Retard » pour les exceptions. Rien n’est enregistré avant la validation."}
            </p>
          </Card>
        </aside>
      </div>

      {/* phones and tablets: the same summary in a bar at the bottom */}
      <div
        role="region"
        aria-label="Validation de l’appel"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden dark:border-slate-700 dark:bg-[var(--surface)]/95"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">{counts}</div>
          <Button type="button" size="lg" disabled={readOnly || saving || !canSubmit || !subjectId} onClick={() => void handleSave()} className="sm:min-w-[11rem]">
            {buttonLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
