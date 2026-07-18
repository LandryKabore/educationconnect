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
import { fullName } from "@/lib/utils";
import { SaveButton } from "@/components/SaveButton";
import {
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
      return (data ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
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

  const dirty = students.some((s) => {
    const current = Object.prototype.hasOwnProperty.call(statuses, s.id)
      ? statuses[s.id]
      : (savedByStudent.get(s.id) ?? "present");
    const saved = savedByStudent.get(s.id) ?? "present";
    return current !== saved;
  });

  const handleSave = async () => {
    if (!id || !user || !dirty) return;
    setSaving(true);
    for (const student of students) {
      const status = getStatus(student.id);
      await supabase.from("presences").upsert(
        {
          class_section_id: id,
          student_id: student.id,
          date,
          status,
          recorded_by: user.id,
        },
        { onConflict: "class_section_id,student_id,date" },
      );
    }
    toast.success("Présences enregistrées");
    setStatuses({});
    void qc.invalidateQueries({ queryKey: ["presences", id, date] });
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
        <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="mt-1 text-xs text-slate-500">
          {format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}
        </p>
      </Card>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève dans cette classe." />
      ) : (
        <div className="space-y-2">
          {students.map((s) => (
            <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="font-medium">{fullName(s.first_name, s.last_name)}</span>
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
                {(Object.keys(STATUS_LABELS) as AttendanceStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </Select>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
