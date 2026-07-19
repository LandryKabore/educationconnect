import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ATTENDANCE_LABELS,
  TEACHER_ATTENDANCE_STATUSES,
  attendanceToggleClass,
} from "@/lib/attendance";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, Profile } from "@/lib/types";
import { formatDateSafe } from "@/lib/dateFr";
import { cn, fullName } from "@/lib/utils";
import { SaveButton } from "@/components/SaveButton";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

/** Empty until the teacher picks a status — never default to present. */
type StatusValue = AttendanceStatus | "";

function initialDate(param: string | null) {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
  return format(new Date(), "yyyy-MM-dd");
}

export default function Presences() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "school_admin";
  const [date, setDate] = useState(() => initialDate(searchParams.get("date")));
  const [saving, setSaving] = useState(false);

  const onDateChange = (next: string) => {
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

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["class-roster", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("student_id, profils(*)")
        .eq("class_section_id", id!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r) => (r as unknown as { profils: Profile }).profils)
        .filter(Boolean)
        .sort((a, b) =>
          fullName(a.first_name, a.last_name).localeCompare(
            fullName(b.first_name, b.last_name),
            "fr",
          ),
        );
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["presences", id, date],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("presences")
        .select("*")
        .eq("class_section_id", id!)
        .eq("date", date);
      return data ?? [];
    },
  });

  const [statuses, setStatuses] = useState<Record<string, StatusValue>>({});

  useEffect(() => {
    setStatuses({});
  }, [date, id]);

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

  const getStatus = (studentId: string): StatusValue => {
    if (Object.prototype.hasOwnProperty.call(statuses, studentId)) {
      return statuses[studentId];
    }
    return savedByStudent.get(studentId)?.status ?? "";
  };

  const dirty = students.some((s) => {
    const current = getStatus(s.id);
    const saved = savedByStudent.get(s.id)?.status ?? "";
    return current !== saved;
  });

  const unmarked = students.filter((s) => getStatus(s.id) === "").length;
  const justifiedCount = students.filter(
    (s) => getStatus(s.id) === "excused",
  ).length;

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const s of students) {
      const st = getStatus(s.id);
      if (st) counts[st] += 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, statuses, savedByStudent]);

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, StatusValue> = {};
    for (const s of students) {
      // Don't overwrite admin justifications with "mark all".
      const current = getStatus(s.id);
      next[s.id] = current === "excused" ? "excused" : status;
    }
    setStatuses(next);
  };

  const handleSave = async () => {
    if (!id || !user || !dirty) return;

    const stillUnset = students.filter((s) => getStatus(s.id) === "");
    if (stillUnset.length > 0) {
      toast.error(
        `Marquez tous les élèves avant d’enregistrer (${stillUnset.length} sans statut).`,
      );
      return;
    }

    setSaving(true);
    const rows = students.map((student) => {
      const status = getStatus(student.id) as AttendanceStatus;
      const prev = savedByStudent.get(student.id);
      return {
        class_section_id: id,
        student_id: student.id,
        date,
        status,
        // Keep justification note when still excused.
        note:
          status === "excused"
            ? (prev?.note ?? null)
            : status === prev?.status
              ? (prev?.note ?? null)
              : null,
        recorded_by: user.id,
      };
    });
    const { error } = await supabase
      .from("presences")
      .upsert(rows, { onConflict: "class_section_id,student_id,date" });
    if (error) {
      toast.error(error.message || "Enregistrement impossible");
      setSaving(false);
      return;
    }
    toast.success("Présences enregistrées");
    setStatuses({});
    await qc.invalidateQueries({ queryKey: ["presences", id, date] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-presences"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-presences"] });
    setSaving(false);
  };

  return (
    <div>
      <Link
        to={isAdmin ? `/classes/${id}` : `/presences`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {isAdmin ? "Retour à la classe" : "Retour aux présences"}
      </Link>

      <PageHeader
        title="Présences"
        subtitle="Présent, absent ou retard — les justifications sont gérées par l’administration"
        actions={
          <SaveButton
            type="button"
            saving={saving}
            dirty={dirty}
            onClick={() => void handleSave()}
          />
        }
      />

      <Card className="mb-6 max-w-xs">
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-500">
          {formatDateSafe(date, "EEEE d MMMM yyyy", { locale: fr })}
        </p>
      </Card>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève dans cette classe." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Marquer tout le monde :
            </span>
            {TEACHER_ATTENDANCE_STATUSES.map((st) => (
              <Button
                key={st}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => markAll(st)}
              >
                {ATTENDANCE_LABELS[st]}
              </Button>
            ))}
          </div>

          {unmarked > 0 ? (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
              {unmarked} élève{unmarked > 1 ? "s" : ""} sans statut — à
              compléter avant d’enregistrer.
            </p>
          ) : null}

          {justifiedCount > 0 ? (
            <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100">
              {justifiedCount} absence
              {justifiedCount > 1 ? "s" : ""} justifiée
              {justifiedCount > 1 ? "s" : ""} par l’administration (ne compte
              pas comme absence).
            </p>
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Card className="py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Non marqué
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-600">
                {unmarked}
              </p>
            </Card>
            {TEACHER_ATTENDANCE_STATUSES.map((st) => (
              <Card key={st} className="py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {ATTENDANCE_LABELS[st]}
                </p>
                <p
                  className={cn(
                    "mt-1 text-2xl font-bold",
                    st === "present" && "text-emerald-600",
                    st === "absent" && "text-rose-600",
                    st === "late" && "text-amber-600",
                  )}
                >
                  {summary[st]}
                </p>
              </Card>
            ))}
            <Card className="py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Justifié
              </p>
              <p className="mt-1 text-2xl font-bold text-sky-600">
                {summary.excused}
              </p>
            </Card>
          </div>

          <div className="space-y-2">
            {students.map((s) => {
              const value = getStatus(s.id);
              const note = savedByStudent.get(s.id)?.note;
              const isJustified = value === "excused";
              return (
                <Card
                  key={s.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 py-3",
                    value === "" && "border-amber-200 dark:border-amber-500/40",
                    value === "present" &&
                      "border-emerald-200 dark:border-emerald-500/40",
                    value === "absent" &&
                      "border-rose-200 dark:border-rose-500/40",
                    value === "late" &&
                      "border-amber-200 dark:border-amber-500/40",
                    isJustified && "border-sky-200 dark:border-sky-500/40",
                  )}
                >
                  <div className="min-w-0">
                    <span className="font-medium">
                      {fullName(s.first_name, s.last_name)}
                    </span>
                    {isJustified && note ? (
                      <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-300">
                        {note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isJustified ? (
                      <Badge tone="info">Justifié (admin)</Badge>
                    ) : null}
                    <div
                      className="inline-flex flex-wrap gap-1.5"
                      role="group"
                      aria-label={`Présence de ${fullName(s.first_name, s.last_name)}`}
                    >
                      {TEACHER_ATTENDANCE_STATUSES.map((st) => (
                        <button
                          key={st}
                          type="button"
                          className={attendanceToggleClass(
                            st,
                            value === st,
                          )}
                          onClick={() =>
                            setStatuses((prev) => ({
                              ...prev,
                              [s.id]: st,
                            }))
                          }
                        >
                          {ATTENDANCE_LABELS[st]}
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
