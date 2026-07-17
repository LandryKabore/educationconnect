import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatDay } from "@/lib/pdfBulletin";
import { findTimetableConflicts } from "@/lib/timetableConflicts";
import type { ClassSection, Subject, TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

type SlotRow = TimetableSlot & {
  classes: { name: string } | null;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

export default function EmploisDuTemps() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: classesRaw = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as ClassSection[];
    },
  });
  const classes = useMemo(
    () => sortClassesByProgression(classesRaw),
    [classesRaw],
  );

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
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
        .eq("role", "teacher")
        .eq("active", true);
      return (roles ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["affectations", schoolId],
    enabled: !!schoolId && classes.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("teacher_id, class_section_id, subject_id")
        .in(
          "class_section_id",
          classes.map((c) => c.id),
        );
      return (data ?? []) as {
        teacher_id: string;
        class_section_id: string;
        subject_id: string;
      }[];
    },
  });

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["creneaux", schoolId, classes.map((c) => c.id).join(",")],
    enabled: !!schoolId && classes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("*, classes(name), matieres(name), profils(first_name, last_name)")
        .in(
          "class_section_id",
          classes.map((c) => c.id),
        )
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as SlotRow[];
    },
  });

  const classNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classes) m.set(c.id, c.name);
    return m;
  }, [classes]);

  const teachersForClass = useMemo(() => {
    if (!classId) return teachers;
    const ids = new Set(
      assignments
        .filter((a) => a.class_section_id === classId)
        .map((a) => a.teacher_id),
    );
    if (ids.size === 0) return teachers;
    return teachers.filter((t) => ids.has(t.id));
  }, [teachers, assignments, classId]);

  const filterTeachers = useMemo(() => {
    if (!filterClassId) return teachers;
    const fromAssignments = new Set(
      assignments
        .filter((a) => a.class_section_id === filterClassId)
        .map((a) => a.teacher_id),
    );
    const fromSlots = new Set(
      slots
        .filter((s) => s.class_section_id === filterClassId && s.teacher_id)
        .map((s) => s.teacher_id as string),
    );
    const ids = new Set([...fromAssignments, ...fromSlots]);
    if (ids.size === 0) return [];
    return teachers.filter((t) => ids.has(t.id));
  }, [filterClassId, teachers, assignments, slots]);

  const subjectsForTeacher = useMemo(() => {
    if (!teacherId) return [];
    const subjectIds = new Set(
      assignments
        .filter(
          (a) =>
            a.teacher_id === teacherId &&
            (!classId || a.class_section_id === classId),
        )
        .map((a) => a.subject_id),
    );
    return subjects
      .filter((s) => subjectIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [assignments, teacherId, classId, subjects]);

  const describeSlot = useMemo(() => {
    return (slot: {
      id?: string;
      class_section_id: string;
      teacher_id?: string | null;
      room?: string | null;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }) => {
      const full = slots.find((s) => s.id === slot.id);
      const subject = full?.matieres?.name ?? "Matière";
      const teacher = full?.profils
        ? fullName(full.profils.first_name, full.profils.last_name)
        : "sans enseignant";
      const salle = full?.room ? `salle ${full.room}` : null;
      return [subject, teacher, salle].filter(Boolean).join(" · ");
    };
  }, [slots]);

  const liveConflicts = useMemo(() => {
    if (!classId || !teacherId || !showForm) return [];
    const teacher = teachers.find((t) => t.id === teacherId);
    return findTimetableConflicts(
      {
        class_section_id: classId,
        teacher_id: teacherId,
        room: room.trim() || null,
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
      },
      slots,
      {
        teacherName: teacher
          ? fullName(teacher.first_name, teacher.last_name)
          : undefined,
        otherClassName: (id) => classNameById.get(id) ?? "une autre classe",
        describeSlot,
      },
    );
  }, [
    classId,
    showForm,
    teacherId,
    room,
    dayOfWeek,
    startTime,
    endTime,
    slots,
    teachers,
    classNameById,
    describeSlot,
  ]);

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (filterClassId && s.class_section_id !== filterClassId) return false;
      if (filterTeacherId && s.teacher_id !== filterTeacherId) return false;
      return true;
    });
  }, [slots, filterClassId, filterTeacherId]);

  const slotsByDay = useMemo(() => {
    const map = new Map<number, SlotRow[]>();
    for (const s of filteredSlots) {
      const list = map.get(s.day_of_week) ?? [];
      list.push(s);
      map.set(s.day_of_week, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filteredSlots]);

  const resetForm = () => {
    setShowForm(false);
    setSubjectId("");
    setTeacherId("");
    setRoom("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !subjectId || !teacherId) {
      toast.error("Choisissez classe, enseignant et matière");
      return;
    }

    const teacher = teachers.find((t) => t.id === teacherId);
    const conflicts = findTimetableConflicts(
      {
        class_section_id: classId,
        teacher_id: teacherId,
        room: room.trim() || null,
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
      },
      slots,
      {
        teacherName: teacher
          ? fullName(teacher.first_name, teacher.last_name)
          : undefined,
        otherClassName: (id) => classNameById.get(id) ?? "une autre classe",
        describeSlot,
      },
    );

    if (conflicts.length) {
      toast.error(conflicts[0].message);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("creneaux_edt").insert({
      class_section_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message || "Erreur lors de l'ajout");
      return;
    }
    toast.success("Créneau ajouté");
    if (!filterClassId) setFilterClassId(classId);
    resetForm();
    void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const removeSlot = async (id: string) => {
    const { error } = await supabase.from("creneaux_edt").delete().eq("id", id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Créneau retiré");
      void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Emplois du temps"
        subtitle="Par classe, avec contrôle des conflits (classe, prof, salle)"
        actions={
          <Button
            onClick={() => {
              setShowForm(!showForm);
              if (!classId && filterClassId) setClassId(filterClassId);
            }}
          >
            Ajouter un créneau
          </Button>
        }
      />

      <Card className="mb-6 max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Filtrer par classe</Label>
            <Select
              value={filterClassId}
              onChange={(e) => {
                const next = e.target.value;
                setFilterClassId(next);
                setFilterTeacherId("");
              }}
            >
              <option value="">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Filtrer par enseignant</Label>
            <Select
              value={filterTeacherId}
              onChange={(e) => setFilterTeacherId(e.target.value)}
            >
              <option value="">Tous les enseignants</option>
              {filterTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t.first_name, t.last_name)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label>Classe</Label>
              <Select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setTeacherId("");
                  setSubjectId("");
                }}
                required
              >
                <option value="">Choisir…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Enseignant (obligatoire)</Label>
              <Select
                value={teacherId}
                onChange={(e) => {
                  setTeacherId(e.target.value);
                  setSubjectId("");
                }}
                required
                disabled={!classId}
              >
                <option value="">
                  {classId ? "Choisir…" : "Choisissez d’abord une classe"}
                </option>
                {teachersForClass.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t.first_name, t.last_name)}
                  </option>
                ))}
              </Select>
              {classId && teachersForClass.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Aucun enseignant affecté à cette classe — créez une
                  affectation dans Enseignants.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Matière</Label>
              <Select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                disabled={!teacherId}
              >
                <option value="">
                  {!teacherId
                    ? "Choisissez d’abord un enseignant"
                    : subjectsForTeacher.length === 0
                      ? "Aucune matière pour cet enseignant"
                      : "Choisir…"}
                </option>
                {subjectsForTeacher.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {teacherId && subjectsForTeacher.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Cet enseignant n’a pas de matière affectée pour cette classe.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Jour</Label>
              <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Début</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Fin</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Salle (optionnel)</Label>
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="ex. Salle 3"
              />
            </div>

            {liveConflicts.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Conflit(s) détecté(s)
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {liveConflicts.map((c, i) => (
                    <li key={`${c.type}-${i}`}>{c.message}</li>
                  ))}
                </ul>
              </div>
            ) : classId && teacherId ? (
              <p className="text-sm text-emerald-700">Aucun conflit pour ce créneau.</p>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  saving ||
                  liveConflicts.length > 0 ||
                  !classId ||
                  !teacherId ||
                  !subjectId
                }
              >
                {saving ? "Ajout…" : "Ajouter"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : filteredSlots.length === 0 ? (
        <EmptyState
          message={
            slots.length === 0
              ? "Aucun créneau défini."
              : "Aucun créneau pour ce filtre."
          }
        />
      ) : (
        <div className="space-y-6">
          {slotsByDay.map(([day, daySlots]) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {formatDay(day)}
              </h3>
              <div className="space-y-2">
                {daySlots.map((slot) => (
                  <Card
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium">
                        {slot.start_time?.slice(0, 5)} – {slot.end_time?.slice(0, 5)}
                        {" · "}
                        {slot.profils
                          ? fullName(slot.profils.first_name, slot.profils.last_name)
                          : "Sans enseignant"}
                        {" · "}
                        {slot.matieres?.name}
                        {!filterClassId ? ` · ${slot.classes?.name}` : ""}
                      </p>
                      {slot.room ? (
                        <p className="text-sm text-slate-500">Salle {slot.room}</p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeSlot(slot.id)}
                    >
                      Supprimer
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
