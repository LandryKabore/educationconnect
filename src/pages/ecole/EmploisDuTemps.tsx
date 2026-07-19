import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import { formatDay } from "@/lib/pdfBulletin";
import { findTimetableConflicts } from "@/lib/timetableConflicts";
import type { ClassSection, Subject, TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Modal } from "@/components/Modal";
import { ClassColorBadge, ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { cn } from "@/lib/utils";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { useSchoolTimetableRealtime } from "@/hooks/useStudentTimetableUpdates";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
  TimeInput24,
} from "@/components/ui";

const EMPTY_CLASSES: ClassSection[] = [];

type SlotRow = TimetableSlot & {
  classes: { name: string } | null;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

/** Créneaux horaires : 06:00 → 23:45, pas de 15 min */
const TIMETABLE_TIME_OPTIONS = (() => {
  const opts: string[] = [];
  for (let h = 6; h <= 23; h++) {
    for (const m of [0, 15, 30, 45]) {
      opts.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  }
  return opts;
})();

export default function EmploisDuTemps() {
  const { schoolId, user } = useAuth();
  const qc = useQueryClient();
  useSchoolTimetableRealtime(schoolId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const [showExamForm, setShowExamForm] = useState(false);
  const [examSubjectId, setExamSubjectId] = useState("");
  const [examTeacherId, setExamTeacherId] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examDueDate, setExamDueDate] = useState("");
  const [examStartTime, setExamStartTime] = useState("08:00");
  const [examEndTime, setExamEndTime] = useState("10:00");
  const [examSaving, setExamSaving] = useState(false);

  const { data: classesRaw } = useQuery({
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
    () => sortClassesByProgression(classesRaw ?? EMPTY_CLASSES),
    [classesRaw],
  );

  useEffect(() => {
    if (!classes.length) {
      if (filterClassId !== "") setFilterClassId("");
      return;
    }
    if (!filterClassId || !classes.some((c) => c.id === filterClassId)) {
      setFilterClassId(classes[0].id);
    }
  }, [classes, filterClassId]);

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
    queryKey: ["affectations", schoolId, "v2"],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select(
          "id, affectations_enseignement(teacher_id, class_section_id, subject_id)",
        )
        .eq("school_id", schoolId!);
      if (error) throw error;
      const rows: {
        teacher_id: string;
        class_section_id: string;
        subject_id: string;
      }[] = [];
      for (const cls of data ?? []) {
        const affs = (
          cls as {
            affectations_enseignement?: {
              teacher_id: string;
              class_section_id: string;
              subject_id: string;
            }[] | null;
          }
        ).affectations_enseignement;
        if (!Array.isArray(affs)) continue;
        for (const a of affs) rows.push(a);
      }
      return rows;
    },
  });

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["creneaux", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select(
          "*, classes!inner(name, school_id), matieres(name), profils(first_name, last_name)",
        )
        .eq("classes.school_id", schoolId!)
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
    if (teacherId) ids.add(teacherId);
    if (ids.size === 0) return teachers;
    return teachers.filter((t) => ids.has(t.id));
  }, [teachers, assignments, classId, teacherId]);

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
    // Keep current subject visible when editing even if affectation changed.
    if (subjectId) subjectIds.add(subjectId);
    return subjects
      .filter((s) => subjectIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [assignments, teacherId, classId, subjects, subjectId]);

  const examTeachersForClass = useMemo(() => {
    if (!filterClassId) return teachers;
    const ids = new Set(
      assignments
        .filter((a) => a.class_section_id === filterClassId)
        .map((a) => a.teacher_id),
    );
    if (examTeacherId) ids.add(examTeacherId);
    if (ids.size === 0) return teachers;
    return teachers.filter((t) => ids.has(t.id));
  }, [teachers, assignments, filterClassId, examTeacherId]);

  const examSubjectsForTeacher = useMemo(() => {
    if (!examTeacherId || !filterClassId) return [];
    const subjectIds = new Set(
      assignments
        .filter(
          (a) =>
            a.teacher_id === examTeacherId &&
            a.class_section_id === filterClassId,
        )
        .map((a) => a.subject_id),
    );
    if (examSubjectId) subjectIds.add(examSubjectId);
    return subjects
      .filter((s) => subjectIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [assignments, examTeacherId, filterClassId, subjects, examSubjectId]);

  const { data: classExams = [] } = useQuery({
    queryKey: ["ecole-examens-classe", filterClassId],
    enabled: !!filterClassId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("devoirs")
        .select(
          "id, title, due_date, start_time, end_time, admin_confirmed, matieres(name), teacher:profils!devoirs_teacher_id_fkey(first_name, last_name)",
        )
        .eq("kind", "examen")
        .eq("class_section_id", filterClassId)
        .gte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        due_date: string | null;
        start_time: string | null;
        end_time: string | null;
        admin_confirmed: boolean;
        matieres: { name: string } | null;
        teacher: { first_name: string; last_name: string } | null;
      }[];
    },
  });

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
        id: editingId ?? undefined,
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
    editingId,
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
    if (!filterClassId) return [];
    return slots.filter((s) => {
      if (s.class_section_id !== filterClassId) return false;
      if (filterTeacherId && s.teacher_id !== filterTeacherId) return false;
      return true;
    });
  }, [slots, filterClassId, filterTeacherId]);

  const gridSlots: TimetableGridSlot[] = useMemo(
    () =>
      filteredSlots.map((s) => ({
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
    [filteredSlots],
  );

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSubjectId("");
    setTeacherId("");
    setRoom("");
  };

  const resetExamForm = () => {
    setShowExamForm(false);
    setExamSubjectId("");
    setExamTeacherId("");
    setExamTitle("");
    setExamDescription("");
    setExamDueDate("");
    setExamStartTime("08:00");
    setExamEndTime("10:00");
  };

  const openCreate = () => {
    setEditingId(null);
    setSubjectId("");
    setTeacherId("");
    setDayOfWeek("1");
    setStartTime("08:00");
    setEndTime("09:00");
    setRoom("");
    setClassId(filterClassId || classId || "");
    setShowExamForm(false);
    setShowForm(true);
  };

  const openCreateExam = () => {
    if (!filterClassId) {
      toast.error("Choisissez d’abord une classe");
      return;
    }
    setShowForm(false);
    setExamSubjectId("");
    setExamTeacherId("");
    setExamTitle("");
    setExamDescription("");
    setExamDueDate("");
    setExamStartTime("08:00");
    setExamEndTime("10:00");
    setShowExamForm(true);
  };

  const openEdit = (id: string) => {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return;
    setEditingId(slot.id);
    setClassId(slot.class_section_id);
    setTeacherId(slot.teacher_id ?? "");
    setSubjectId(slot.subject_id);
    setDayOfWeek(String(slot.day_of_week));
    setStartTime(slot.start_time.slice(0, 5));
    setEndTime(slot.end_time.slice(0, 5));
    setRoom(slot.room ?? "");
    setFilterClassId(slot.class_section_id);
    setShowExamForm(false);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !subjectId || !teacherId) {
      toast.error("Choisissez classe, enseignant et matière");
      return;
    }

    const teacher = teachers.find((t) => t.id === teacherId);
    const conflicts = findTimetableConflicts(
      {
        id: editingId ?? undefined,
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

    const payload = {
      class_section_id: classId,
      subject_id: subjectId,
      teacher_id: teacherId,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      room: room.trim() || null,
    };

    setSaving(true);
    const { error } = editingId
      ? await supabase.from("creneaux_edt").update(payload).eq("id", editingId)
      : await supabase.from("creneaux_edt").insert(payload);
    setSaving(false);

    if (error) {
      toast.error(
        error.message ||
          (editingId ? "Erreur lors de la modification" : "Erreur lors de l'ajout"),
      );
      return;
    }
    toast.success(editingId ? "Créneau modifié" : "Créneau ajouté");
    setFilterClassId(classId);
    resetForm();
    void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const removeSlot = async (id: string) => {
    const slot = slots.find((s) => s.id === id);
    const subject = slot?.matieres?.name ?? "ce créneau";
    const day = slot ? formatDay(slot.day_of_week) : "";
    const time =
      slot?.start_time && slot?.end_time
        ? `${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`
        : "";
    const detail = [subject, day, time].filter(Boolean).join(" · ");

    const ok = window.confirm(
      `Supprimer ce créneau ?\n\n${detail}\n\nCette action est définitive.`,
    );
    if (!ok) return;

    const { error } = await supabase.from("creneaux_edt").delete().eq("id", id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Créneau retiré");
      void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !filterClassId) return;
    if (!examTeacherId || !examSubjectId) {
      toast.error("Choisissez l’enseignant et la matière");
      return;
    }
    if (!examTitle.trim()) {
      toast.error("Indiquez un titre");
      return;
    }
    if (!examDueDate) {
      toast.error("Indiquez la date de l’examen");
      return;
    }
    if (!examStartTime || !examEndTime) {
      toast.error("Indiquez le créneau horaire (début et fin)");
      return;
    }
    if (examStartTime >= examEndTime) {
      toast.error("L’heure de fin doit être après l’heure de début");
      return;
    }

    const { data: conflicts, error: conflictError } = await supabase
      .from("devoirs")
      .select("id, title, start_time, end_time, matieres(name)")
      .eq("kind", "examen")
      .eq("class_section_id", filterClassId)
      .eq("due_date", examDueDate)
      .limit(1);
    if (conflictError) {
      toast.error(conflictError.message || "Vérification impossible");
      return;
    }
    const conflict = conflicts?.[0] as
      | {
          title: string;
          matieres: { name: string } | null;
          start_time: string | null;
          end_time: string | null;
        }
      | undefined;
    if (conflict) {
      const subject = conflict.matieres?.name ?? "Matière";
      const slot = formatExamSchedule({
        due_date: examDueDate,
        start_time: conflict.start_time,
        end_time: conflict.end_time,
      });
      toast.error(
        `Un examen est déjà prévu ce jour pour cette classe (${subject}${
          slot ? ` · ${slot}` : ""
        }). Choisissez une autre date.`,
      );
      return;
    }

    setExamSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("devoirs").insert({
      class_section_id: filterClassId,
      subject_id: examSubjectId,
      teacher_id: examTeacherId,
      title: examTitle.trim(),
      description: examDescription.trim() || null,
      due_date: examDueDate,
      kind: "examen",
      start_time: examStartTime,
      end_time: examEndTime,
      admin_confirmed: true,
      confirmed_at: now,
      confirmed_by: user.id,
    });
    setExamSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error(
          "Un examen est déjà prévu ce jour pour cette classe. Choisissez une autre date.",
        );
        return;
      }
      toast.error(error.message || "Création impossible");
      return;
    }

    toast.success("Examen créé et confirmé — visible pour les élèves");
    resetExamForm();
    void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
    void qc.invalidateQueries({ queryKey: ["ecole-examens-classe"] });
    void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
    void qc.invalidateQueries({ queryKey: ["mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["devoirs"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
    void qc.invalidateQueries({ queryKey: ["examen-jours-classe"] });
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Emplois du temps"
        subtitle="Lundi à samedi · conflits classe, enseignant et salle"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={openCreateExam}
              disabled={!filterClassId}
            >
              <FileText className="h-4 w-4" />
              Créer un examen
            </Button>
            <Button onClick={openCreate}>Ajouter un créneau</Button>
          </div>
        }
      />

      <Card className="mb-6 max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Classe</Label>
            <Select
              value={filterClassId}
              onChange={(e) => {
                setFilterClassId(e.target.value);
                setFilterTeacherId("");
              }}
              disabled={classes.length === 0}
            >
              {classes.length === 0 ? (
                <option value="">Aucune classe</option>
              ) : (
                classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </Select>
            {filterClassId ? (
              <div className="mt-2">
                <ClassColorBadge
                  id={filterClassId}
                  name={classNameById.get(filterClassId) ?? "Classe"}
                />
              </div>
            ) : null}
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
        {classes.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setFilterClassId(c.id);
                  setFilterTeacherId("");
                }}
                style={classColorVars({ id: c.id, name: c.name })}
                data-class-color
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium transition",
                  filterClassId === c.id
                    ? CLASS_COLOR_SURFACE
                    : "border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                )}
              >
                <ClassColorDot id={c.id} name={c.name} />
                <span className="max-w-[7rem] truncate">{c.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Card>

      {showForm ? (
        <Modal
          open={showForm}
          title={editingId ? "Modifier le créneau" : "Ajouter un créneau"}
          onClose={resetForm}
          closeDisabled={saving}
        >
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
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
                <Select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                >
                  {TIMETABLE_TIME_OPTIONS.map((t) => (
                    <option key={`start-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Fin</Label>
                <Select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                >
                  {TIMETABLE_TIME_OPTIONS.map((t) => (
                    <option key={`end-${t}`} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
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
                {saving
                  ? "Enregistrement…"
                  : editingId
                    ? "Enregistrer"
                    : "Ajouter"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showExamForm ? (
        <Modal
          open={showExamForm}
          title={`Créer un examen — ${classNameById.get(filterClassId) ?? "classe"}`}
          onClose={resetExamForm}
          closeDisabled={examSaving}
        >
          <form
            onSubmit={(e) => void handleSaveExam(e)}
            className="space-y-4"
          >
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              Un seul examen par classe et par jour. L’examen créé ici est
              confirmé immédiatement et visible pour les élèves.
            </p>
            <div>
              <Label>Enseignant</Label>
              <Select
                value={examTeacherId}
                onChange={(e) => {
                  setExamTeacherId(e.target.value);
                  setExamSubjectId("");
                }}
                required
              >
                <option value="">Choisir…</option>
                {examTeachersForClass.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t.first_name, t.last_name)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Matière</Label>
              <Select
                value={examSubjectId}
                onChange={(e) => setExamSubjectId(e.target.value)}
                required
                disabled={!examTeacherId}
              >
                <option value="">
                  {!examTeacherId
                    ? "Choisissez d’abord un enseignant"
                    : examSubjectsForTeacher.length === 0
                      ? "Aucune matière pour cet enseignant"
                      : "Choisir…"}
                </option>
                {examSubjectsForTeacher.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Titre</Label>
              <Input
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="ex. Contrôle de mathématiques"
                required
              />
            </div>
            <div>
              <Label>Description (optionnel)</Label>
              <Textarea
                value={examDescription}
                onChange={(e) => setExamDescription(e.target.value)}
                rows={3}
                placeholder="ex. Chapitres 1 à 3, calculatrice autorisée"
              />
            </div>
            <div>
              <Label>Date de l’examen</Label>
              <Input
                type="date"
                value={examDueDate}
                onChange={(e) => setExamDueDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Début</Label>
                <TimeInput24
                  value={examStartTime}
                  onChange={setExamStartTime}
                  required
                />
              </div>
              <div>
                <Label>Fin</Label>
                <TimeInput24
                  value={examEndTime}
                  onChange={setExamEndTime}
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  examSaving ||
                  !examTeacherId ||
                  !examSubjectId ||
                  !examTitle.trim() ||
                  !examDueDate
                }
              >
                {examSaving ? "Création…" : "Créer et confirmer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetExamForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Créez d’abord des classes pour planifier l’emploi du temps." />
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            {filteredSlots.length === 0 ? (
              <EmptyState message="Aucun créneau pour cette classe — ajoutez-en pour remplir la grille." />
            ) : null}
            <TimetableGrid
              slots={gridSlots}
              title={`Emploi du temps — ${classNameById.get(filterClassId) ?? "classe"}`}
              onSelect={openEdit}
              onRemove={(id) => void removeSlot(id)}
            />
          </div>

          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Examens à venir
                </h2>
                <p className="text-xs text-slate-500">
                  {classNameById.get(filterClassId) ?? "Classe"} · dates
                  confirmées ou en attente
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={openCreateExam}
              >
                <FileText className="h-4 w-4" />
                Créer un examen
              </Button>
            </div>
            {classExams.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucun examen à venir pour cette classe.
              </p>
            ) : (
              <ul className="space-y-2">
                {classExams.map((exam) => {
                  const slot = formatExamSchedule(exam);
                  const teacher = exam.teacher
                    ? fullName(
                        exam.teacher.first_name,
                        exam.teacher.last_name,
                      )
                    : null;
                  return (
                    <li
                      key={exam.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {exam.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {[
                            exam.matieres?.name,
                            teacher,
                            exam.due_date
                              ? formatDateSafe(exam.due_date, "EEEE d MMMM yyyy", {
                                  locale: fr,
                                })
                              : null,
                            slot,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge
                        tone={exam.admin_confirmed ? "success" : "warning"}
                      >
                        {exam.admin_confirmed ? "Confirmé" : "En attente"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
