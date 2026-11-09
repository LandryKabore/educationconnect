import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, Lock, Search, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAllowVersionWrite } from "@/contexts/VersionPolicyContext";
import { useActingTeacherId } from "@/hooks/useActingTeacherId";
import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, Profile, Subject } from "@/lib/types";
import { formatDateSafe } from "@/lib/dateFr";
import { cn, fullName, joinProfile, matchesSearch } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import {
  UNSAVED_ROLLCALL_MESSAGE,
  useUnsavedChangesGuard,
} from "@/hooks/useUnsavedChangesGuard";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

/**
 * Roll call = « everyone present, tap only the exceptions ».
 * The « present » of a student nobody touched is only a DRAFT on this screen:
 * nothing is written to the database until the teacher presses « Valider l'appel »,
 * so a forgotten roll call never turns into 50 false « present » rows.
 */
type StatusValue = AttendanceStatus;

const ROLL_BUTTONS: { status: "present" | "absent" | "late"; short: string }[] = [
  { status: "present", short: "P" },
  { status: "absent", short: "A" },
  { status: "late", short: "R" },
];

function rollButtonClass(status: "present" | "absent" | "late", active: boolean) {
  const base =
    "inline-flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition";
  if (!active) {
    return `${base} border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200`;
  }
  if (status === "present") return `${base} border-emerald-600 bg-emerald-600 text-white`;
  if (status === "absent") return `${base} border-rose-600 bg-rose-600 text-white`;
  return `${base} border-amber-500 bg-amber-500 text-white`;
}

function initials(first?: string | null, last?: string | null) {
  return `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase() || "?";
}

function initialDate(param: string | null) {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
  return format(new Date(), "yyyy-MM-dd");
}

export default function Presences() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuth();
  const { actingTeacherId, isProxy, proxyTeacherId } = useActingTeacherId();
  const qc = useQueryClient();
  const allowVersionWrite = useAllowVersionWrite();
  const isAdmin = role === "school_admin";
  /** Admin acting for a specific teacher — behave like that teacher for subjects. */
  const asTeacher = !isAdmin || isProxy;
  const [date, setDate] = useState(() => initialDate(searchParams.get("date")));
  /** Only used when the teacher teaches several subjects in this class (or admin). */
  const [subjectOverride, setSubjectOverride] = useState(
    () => searchParams.get("matiere") ?? "",
  );
  const [saving, setSaving] = useState(false);
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

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["class-roster", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select(
          "student_id, profils:profils!inscriptions_student_id_fkey(*)",
        )
        .eq("class_section_id", id!)
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
    queryKey: ["presences", id, date, subjectId],
    enabled: !!id && !!subjectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("presences")
        .select("*")
        .eq("class_section_id", id!)
        .eq("date", date)
        .eq("subject_id", subjectId);
      return data ?? [];
    },
  });

  const [statuses, setStatuses] = useState<Record<string, StatusValue>>({});
  const [view, setView] = useState<"exceptions" | "all">("exceptions");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setStatuses({});
    setSearch("");
  }, [date, id, subjectId]);

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
  unsavedRef.current = hasTaps;
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
  const exceptionCount = summary.absent + summary.late + summary.excused;

  const visibleStudents = useMemo(() => {
    if (search.trim()) {
      return students.filter((s) =>
        matchesSearch(search, s.first_name, s.last_name),
      );
    }
    if (view === "all") return students;
    return students.filter((s) => getStatus(s.id) !== "present");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, search, view, statuses, savedByStudent]);

  const handleSave = async () => {
    if (!id || !user || !canSubmit) return;
    if (!subjectId) {
      toast.error(
        isAdmin
          ? "Choisissez une matière"
          : "Aucune matière assignée pour cette classe",
      );
      return;
    }
    if (!allowVersionWrite()) return;

    setSaving(true);
    // Only rows that are new or changed are written: a re-validation never touches
    // the lines already saved (and never an « excused » line set by the school).
    const rows = students
      .filter((student) => {
        const prev = savedByStudent.get(student.id);
        return !prev || getStatus(student.id) !== prev.status;
      })
      .map((student) => ({
        class_section_id: id,
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
      queryKey: ["presences", id, date, subjectId],
    });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-presences"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-presences"] });
    void qc.invalidateQueries({ queryKey: ["mes-presences"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    setSaving(false);
  };

  const selectedSubject = subjects.find((s) => s.id === subjectId);

  return (
    <div className="pb-28">
      <UnsavedChangesDialog blocker={blocker} />
      <Link
        to={
          isProxy
            ? `/saisie-enseignant?teacherId=${encodeURIComponent(proxyTeacherId!)}`
            : isAdmin
              ? `/classes/${id}`
              : `/presences`
        }
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {isProxy
          ? "Retour à la saisie enseignant"
          : isAdmin
            ? "Retour à la classe"
            : "Retour aux présences"}
      </Link>

      <PageHeader
        title="Appel"
        subtitle="Tous présents par défaut — touchez seulement les absents et les retards"
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

      {subjectsLoading || isLoading ? (
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
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève dans cette classe." />
      ) : (
        <>
          <p
            className={cn(
              "mb-4 rounded-xl border px-3 py-2 text-sm",
              validated
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100",
            )}
          >
            {validated ? (
              <>
                <strong>Appel validé.</strong> Vous pouvez encore corriger un élève, puis
                « Mettre à jour l’appel ».
              </>
            ) : (
              <>
                Tous <strong>présents</strong> par défaut. Touchez seulement les{" "}
                <strong>exceptions</strong>. Rien n’est enregistré avant « Valider
                l’appel ».
              </>
            )}
          </p>

          {!validated || changed ? (
            <p
              role="status"
              data-testid="rollcall-unvalidated"
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <TriangleAlert className="h-4 w-4" aria-hidden />
              Appel non validé
              {hasTaps ? " — modifications non enregistrées" : ""}
            </p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setView("exceptions")}
              aria-pressed={view === "exceptions" && !search.trim()}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                view === "exceptions" && !search.trim()
                  ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                  : "border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              Exceptions ({exceptionCount})
            </button>
            <button
              type="button"
              onClick={() => setView("all")}
              aria-pressed={view === "all" && !search.trim()}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                view === "all" && !search.trim()
                  ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
                  : "border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              Tous ({students.length})
            </button>
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                aria-label="Chercher un élève"
                placeholder="Chercher un élève"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                className="h-10 rounded-full pl-9"
              />
            </div>
          </div>

          {visibleStudents.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {search.trim()
                  ? "Aucun élève ne correspond à cette recherche."
                  : `Aucune exception : les ${students.length} élèves sont présents. Touchez « Tous » ou cherchez un nom pour marquer un absent ou un retard.`}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {visibleStudents.map((s) => {
                const value = getStatus(s.id);
                const note = savedByStudent.get(s.id)?.note;
                const locked = value === "excused" && (asTeacher || !isAdmin);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 dark:bg-[var(--surface)]",
                      value === "present" &&
                        "border-slate-200 dark:border-slate-700",
                      value === "absent" &&
                        "border-rose-300 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-950/30",
                      value === "late" &&
                        "border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-950/30",
                      value === "excused" &&
                        "border-sky-200 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-950/30",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                    >
                      {initials(s.first_name, s.last_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-tight">
                        <PersonName first={s.first_name} last={s.last_name} />
                      </p>
                      {value === "excused" && note ? (
                        <p className="truncate text-xs text-sky-700 dark:text-sky-300">
                          {note}
                        </p>
                      ) : null}
                    </div>
                    {locked ? (
                      <Badge tone="info">
                        <Lock className="mr-1 h-3 w-3" />
                        Justifié
                      </Badge>
                    ) : (
                      <div
                        className="inline-flex shrink-0 gap-1.5"
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
                            className={rollButtonClass(b.status, value === b.status)}
                            onClick={() =>
                              setStatuses((prev) => ({ ...prev, [s.id]: b.status }))
                            }
                          >
                            {b.short}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div
            role="region"
            aria-label="Validation de l’appel"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:left-72 dark:border-slate-700 dark:bg-[var(--surface)]/95"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
              <dl className="grid flex-1 grid-cols-4 gap-2 text-center">
                {(
                  [
                    ["présents", summary.present, "text-emerald-600"],
                    ["absents", summary.absent, "text-rose-600"],
                    ["retards", summary.late, "text-amber-600"],
                    ["justifiés", summary.excused, "text-sky-600"],
                  ] as const
                ).map(([label, n, tone]) => (
                  <div
                    key={label}
                    className="rounded-lg bg-slate-100 px-1 py-1.5 dark:bg-[var(--surface-2)]"
                  >
                    <dd className={cn("text-lg font-bold leading-none", tone)}>{n}</dd>
                    <dt className="mt-0.5 text-[11px] text-slate-500">{label}</dt>
                  </div>
                ))}
              </dl>
              <Button
                type="button"
                size="lg"
                disabled={saving || !canSubmit || !subjectId}
                onClick={() => void handleSave()}
                className="sm:min-w-[11rem]"
              >
                {saving
                  ? "Enregistrement…"
                  : validated
                    ? changed
                      ? "Mettre à jour l’appel"
                      : "Appel validé ✓"
                    : "Valider l’appel"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
