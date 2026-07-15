import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatDay } from "@/lib/pdfBulletin";
import type { ClassSection, Subject, TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function EmploisDuTemps() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [room, setRoom] = useState("");

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("school_id", schoolId!);
      return (data ?? []) as ClassSection[];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from("matieres").select("*").eq("school_id", schoolId!);
      return (data ?? []) as Subject[];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["enseignants", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "teacher");
      return (roles ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["creneaux", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const classIds = classes.map((c) => c.id);
      if (!classIds.length) return [];
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, classes(name), matieres(name), profils(first_name, last_name)")
        .in("class_section_id", classIds)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as (TimetableSlot & {
        classes: { name: string };
        matieres: { name: string };
        profils: { first_name: string; last_name: string } | null;
      })[];
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("creneaux_edt").insert({
      class_section_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId || null,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room.trim() || null,
    });
    if (error) {
      toast.error("Erreur lors de l'ajout");
      return;
    }
    toast.success("Créneau ajouté");
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
  };

  return (
    <div>
      <PageHeader
        title="Emplois du temps"
        actions={<Button onClick={() => setShowForm(!showForm)}>Ajouter un créneau</Button>}
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label>Classe</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Choisir…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Matière</Label>
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                <option value="">Choisir…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Enseignant</Label>
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Aucun</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t.first_name, t.last_name)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Jour</Label>
              <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Début</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Salle</Label>
              <Input value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Ajouter</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : slots.length === 0 ? (
        <EmptyState message="Aucun créneau défini." />
      ) : (
        <div className="space-y-3">
          {slots.map((slot) => (
            <Card key={slot.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {slot.classes?.name} — {slot.matieres?.name}
                </p>
                <p className="text-sm text-slate-500">
                  {formatDay(slot.day_of_week)} · {slot.start_time?.slice(0, 5)} —{" "}
                  {slot.end_time?.slice(0, 5)}
                  {slot.room ? ` · Salle ${slot.room}` : ""}
                </p>
                {slot.profils ? (
                  <p className="text-xs text-slate-400">
                    {fullName(slot.profils.first_name, slot.profils.last_name)}
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
