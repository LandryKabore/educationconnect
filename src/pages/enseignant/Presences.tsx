import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus, Profile } from "@/lib/types";
import { formatDateSafe } from "@/lib/dateFr";
import { fullName } from "@/lib/utils";
import { SaveButton } from "@/components/SaveButton";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Justifié",
};

const STATUS_ORDER: AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "excused",
];

export default function Presences() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

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

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  useEffect(() => {
    setStatuses({});
  }, [date, id]);

  const savedByStudent = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    for (const a of attendance) {
      const row = a as { student_id: string; status: AttendanceStatus };
      map.set(row.student_id, row.status);
    }
    return map;
  }, [attendance]);

  const getStatus = (studentId: string): AttendanceStatus => {
    if (Object.prototype.hasOwnProperty.call(statuses, studentId)) {
      return statuses[studentId];
    }
    return savedByStudent.get(studentId) ?? "present";
  };

  const dirty = students.some(
    (s) => getStatus(s.id) !== (savedByStudent.get(s.id) ?? "present"),
  );

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

  const markAll = (status: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    for (const s of students) next[s.id] = status;
    setStatuses(next);
  };

  const handleSave = async () => {
    if (!id || !user || !dirty) return;
    setSaving(true);
    const rows = students.map((student) => ({
      class_section_id: id,
      student_id: student.id,
      date,
      status: getStatus(student.id),
      recorded_by: user.id,
    }));
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
    setSaving(false);
  };

  return (
    <div>
      <Link
        to={`/classes/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la classe
      </Link>

      <PageHeader
        title="Présences"
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
          onChange={(e) => setDate(e.target.value)}
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
            {STATUS_ORDER.map((st) => (
              <Button
                key={st}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => markAll(st)}
              >
                {STATUS_LABELS[st]}
              </Button>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATUS_ORDER.map((st) => (
              <Card key={st} className="py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {STATUS_LABELS[st]}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {summary[st]}
                </p>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            {students.map((s) => (
              <Card
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="font-medium">
                  {fullName(s.first_name, s.last_name)}
                </span>
                <Select
                  value={getStatus(s.id)}
                  onChange={(e) =>
                    setStatuses((prev) => ({
                      ...prev,
                      [s.id]: e.target.value as AttendanceStatus,
                    }))
                  }
                  className="w-40"
                >
                  {STATUS_ORDER.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </Select>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
