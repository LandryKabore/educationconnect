import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatDay } from "@/lib/pdfBulletin";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import {
  badgesForSlots,
  collectVisibleConflicts,
  findTimetableConflicts,
  timeToMinutes,
} from "@/lib/timetableConflicts";
import {
  formatClock,
  formatHoursFr,
  freeRangesOnDay,
  snapDown15,
  snapUp15,
} from "@/lib/timetableLayout";
import type { ClassSection, Profile, Subject, TimetableSlot } from "@/lib/types";
import { cn, fullName } from "@/lib/utils";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import {
  SubjectLegend,
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { TimetableConflictsPanel } from "@/components/TimetableConflictsPanel";
import { TimetableDayAgenda } from "@/components/TimetableDayAgenda";
import { TimetableEditorPanel } from "@/components/TimetableEditorPanel";
import { TimetableHoursCard } from "@/components/TimetableHoursCard";
import { useSchoolTimetableRealtime } from "@/hooks/useStudentTimetableUpdates";
import {
  Button,
  EmptyState,
  PageHeader,
  Select,
} from "@/components/ui";

const EMPTY_CLASSES: ClassSection[] = [];

type SlotRow = TimetableSlot & {
  classes: { name: string } | null;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

type ViewMode = "classe" | "enseignant" | "salle";
type PhoneLayout = "jour" | "semaine";

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

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "classe", label: "Classe" },
  { id: "enseignant", label: "Enseignant" },
  { id: "salle", label: "Salle" },
];

function schoolToday(): number | null {
  const js = new Date().getDay();
  if (js < 1 || js > 6) return null;
  return js;
}

function clockRange(startMin: number): { start: string; end: string } {
  const start = Math.min(23 * 60, Math.max(6 * 60, snapDown15(startMin)));
  let end = start + 60;
  if (end > 23 * 60 + 45) end = 23 * 60 + 45;
  if (end <= start) end = Math.min(start + 15, 23 * 60 + 45);
  return { start: formatClock(start), end: formatClock(end) };
}

export default function EmploisDuTemps() {
  const { schoolId, schools } = useAuth();
  const qc = useQueryClient();
  useSchoolTimetableRealtime(schoolId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("classe");
  const [phoneLayout, setPhoneLayout] = useState<PhoneLayout>("jour");
  const [selectedDay, setSelectedDay] = useState(() => schoolToday() ?? 1);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const todayDow = schoolToday();
  const schoolName = schools.find((s) => s.id === schoolId)?.name ?? "École";

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

  const teacherList = useMemo(
    () => teachers.filter((teacher): teacher is Profile => Boolean(teacher?.id)),
    [teachers],
  );

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
        for (const aff of affs) rows.push(aff);
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
    const map = new Map<string, string>();
    for (const item of classes) map.set(item.id, item.name);
    for (const slot of slots) {
      if (slot.classes?.name) map.set(slot.class_section_id, slot.classes.name);
    }
    return map;
  }, [classes, slots]);

  const rooms = useMemo(() => {
    const names = new Set<string>();
    for (const slot of slots) {
      const name = slot.room?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "fr"));
  }, [slots]);

  useEffect(() => {
    if (viewMode !== "enseignant") return;
    if (filterTeacherId && teacherList.some((teacher) => teacher.id === filterTeacherId)) {
      return;
    }
    if (teacherList[0]) setFilterTeacherId(teacherList[0].id);
  }, [viewMode, teacherList, filterTeacherId]);

  useEffect(() => {
    if (viewMode !== "salle") return;
    if (filterRoom && rooms.includes(filterRoom)) return;
    setFilterRoom(rooms[0] ?? "");
  }, [viewMode, rooms, filterRoom]);

  const subjectsForClass = useMemo(() => {
    if (!classId) return [];
    const ids = new Set(
      assignments
        .filter((aff) => aff.class_section_id === classId)
        .map((aff) => aff.subject_id),
    );
    if (subjectId) ids.add(subjectId);
    return subjects
      .filter((subject) => ids.has(subject.id))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [assignments, classId, subjects, subjectId]);

  const teachersForSubject = useMemo(() => {
    if (!classId || !subjectId) return [];
    const ids = new Set(
      assignments
        .filter(
          (aff) =>
            aff.class_section_id === classId && aff.subject_id === subjectId,
        )
        .map((aff) => aff.teacher_id),
    );
    if (teacherId) ids.add(teacherId);
    return teacherList.filter((teacher) => ids.has(teacher.id));
  }, [assignments, classId, subjectId, teacherList, teacherId]);

  const filterTeachers = useMemo(() => {
    if (!filterClassId) return teacherList;
    const fromAssignments = new Set(
      assignments
        .filter((aff) => aff.class_section_id === filterClassId)
        .map((aff) => aff.teacher_id),
    );
    const fromSlots = new Set(
      slots
        .filter((slot) => slot.class_section_id === filterClassId && slot.teacher_id)
        .map((slot) => slot.teacher_id),
    );
    const ids = new Set([...fromAssignments, ...fromSlots]);
    if (ids.size === 0) return [];
    return teacherList.filter((teacher) => ids.has(teacher.id));
  }, [filterClassId, teacherList, assignments, slots]);

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
      const full = slots.find((item) => item.id === slot.id);
      const subject = full?.matieres?.name ?? "Matière";
      const teacher = full?.profils
        ? fullName(full.profils.first_name, full.profils.last_name)
        : "sans enseignant";
      const salle = full?.room ? `salle ${full.room}` : null;
      return [subject, teacher, salle].filter(Boolean).join(" · ");
    };
  }, [slots]);

  const conflictLabels = useMemo(
    () => ({
      teacherNameFor: (slot: { id?: string }) => {
        const full = slots.find((item) => item.id === slot.id);
        return full?.profils
          ? fullName(full.profils.first_name, full.profils.last_name)
          : undefined;
      },
      otherClassName: (id: string) => classNameById.get(id) ?? "une autre classe",
      describeSlot,
    }),
    [slots, classNameById, describeSlot],
  );

  const liveConflicts = useMemo(() => {
    if (!classId || !showForm) return [];
    const teacher = teacherList.find((item) => item.id === teacherId);
    return findTimetableConflicts(
      {
        id: editingId ?? undefined,
        class_section_id: classId,
        teacher_id: teacherId || null,
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
    teacherList,
    classNameById,
    describeSlot,
  ]);

  const filteredSlots = useMemo(() => {
    if (viewMode === "enseignant") {
      if (!filterTeacherId) return [];
      return slots.filter((slot) => slot.teacher_id === filterTeacherId);
    }
    if (viewMode === "salle") {
      if (!filterRoom) return [];
      return slots.filter((slot) => (slot.room?.trim() ?? "") === filterRoom);
    }
    if (!filterClassId) return [];
    return slots.filter((slot) => {
      if (slot.class_section_id !== filterClassId) return false;
      if (filterTeacherId && slot.teacher_id !== filterTeacherId) return false;
      return true;
    });
  }, [slots, viewMode, filterClassId, filterTeacherId, filterRoom]);

  const visibleConflicts = useMemo(
    () => collectVisibleConflicts(filteredSlots, slots, conflictLabels),
    [filteredSlots, slots, conflictLabels],
  );

  const visibleIds = useMemo(
    () => new Set(filteredSlots.map((slot) => slot.id)),
    [filteredSlots],
  );

  const conflictBadges = useMemo(
    () => badgesForSlots(visibleConflicts, visibleIds),
    [visibleConflicts, visibleIds],
  );

  const conflictDays = useMemo(
    () => [...new Set(visibleConflicts.map((conflict) => conflict.day))],
    [visibleConflicts],
  );

  const gridSlots: TimetableGridSlot[] = useMemo(
    () =>
      filteredSlots.map((slot) => ({
        id: slot.id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        subjectName: slot.matieres?.name ?? "Matière",
        teacherName:
          viewMode === "enseignant"
            ? null
            : slot.profils
              ? fullName(slot.profils.first_name, slot.profils.last_name)
              : null,
        className:
          viewMode === "classe"
            ? null
            : (classNameById.get(slot.class_section_id) ?? null),
        room: slot.room,
      })),
    [filteredSlots, viewMode, classNameById],
  );

  const plannedMinutes = useMemo(
    () =>
      gridSlots.reduce(
        (sum, slot) =>
          sum +
          Math.max(0, timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time)),
        0,
      ),
    [gridSlots],
  );

  const otherClasses = useMemo(() => {
    const map = new Map<string, string>();
    for (const conflict of liveConflicts) {
      if (!conflict.otherSlotId) continue;
      const other = slots.find((slot) => slot.id === conflict.otherSlotId);
      if (!other || other.class_section_id === classId) continue;
      const name = classNameById.get(other.class_section_id);
      if (name) map.set(other.class_section_id, name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [liveConflicts, slots, classId, classNameById]);

  const otherTeachers = useMemo(() => {
    if (!subjectId) return [];
    const ids = new Set(
      assignments
        .filter((aff) => aff.subject_id === subjectId)
        .map((aff) => aff.teacher_id),
    );
    return teacherList
      .filter((teacher) => ids.has(teacher.id) && teacher.id !== teacherId)
      .map((teacher) => ({
        id: teacher.id,
        name: fullName(teacher.first_name, teacher.last_name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [assignments, subjectId, teacherList, teacherId]);

  const freeSlotsText = useMemo(() => {
    if (!showForm || !teacherId) return null;
    const teacher = teacherList.find((item) => item.id === teacherId);
    if (!teacher) return null;
    const name = fullName(teacher.first_name, teacher.last_name);
    const day = Number(dayOfWeek);
    const busy = slots.filter(
      (slot) =>
        slot.teacher_id === teacherId &&
        slot.day_of_week === day &&
        slot.id !== editingId,
    );
    const free = freeRangesOnDay(busy, 7 * 60, 17 * 60, 30);
    if (free.length === 0) {
      return `Aucun créneau libre pour ${name} ce jour (07:00–17:00).`;
    }
    const list = free
      .map((range) => `${formatClock(range.startMin)}–${formatClock(range.endMin)}`)
      .join(", ");
    return `Créneaux libres pour ${name} ce jour : ${list}`;
  }, [showForm, teacherId, teacherList, dayOfWeek, slots, editingId]);

  const subjectName =
    subjects.find((subject) => subject.id === subjectId)?.name ?? null;

  const panelSubtitle = [
    classNameById.get(classId),
    formatDay(Number(dayOfWeek)),
    startTime && endTime ? `${startTime}–${endTime}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const addStartForSelectedDay = useMemo(() => {
    const lastEnd = filteredSlots.reduce((max, slot) => {
      if (slot.day_of_week !== selectedDay) return max;
      return Math.max(max, timeToMinutes(slot.end_time));
    }, 0);
    if (lastEnd <= 0) return 8 * 60;
    return Math.min(snapUp15(lastEnd), 23 * 60);
  }, [filteredSlots, selectedDay]);

  const viewLabel = useMemo(() => {
    if (viewMode === "enseignant") {
      const teacher = teacherList.find((item) => item.id === filterTeacherId);
      return teacher
        ? fullName(teacher.first_name, teacher.last_name)
        : "Enseignant";
    }
    if (viewMode === "salle") return filterRoom ? `Salle ${filterRoom}` : "Salle";
    return classNameById.get(filterClassId) ?? "classe";
  }, [viewMode, teacherList, filterTeacherId, filterRoom, classNameById, filterClassId]);

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    setShowForm(false);
    setEditingId(null);
    if (mode === "classe") setFilterTeacherId("");
  };

  const handleDownloadPdf = () => {
    if (filteredSlots.length === 0) {
      toast.message("Aucun créneau à exporter");
      return;
    }
    setExporting(true);
    try {
      const teacher =
        viewMode === "classe" && filterTeacherId
          ? teacherList.find((item) => item.id === filterTeacherId)
          : null;
      const doc = generateEmploiDuTempsPdf({
        schoolName,
        className:
          viewMode === "classe"
            ? (classNameById.get(filterClassId) ?? "—")
            : viewLabel,
        extraLine: teacher
          ? `Enseignant : ${fullName(teacher.first_name, teacher.last_name)}`
          : null,
        slots: filteredSlots.map((slot) => ({
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          subjectName: slot.matieres?.name ?? "Matière",
          teacherName:
            viewMode === "enseignant"
              ? (classNameById.get(slot.class_section_id) ?? null)
              : slot.profils
                ? fullName(slot.profils.first_name, slot.profils.last_name)
                : null,
          room: slot.room,
        })),
      });
      const safe = viewLabel
        .replace(/\s+/g, "-")
        .replace(/[^\w\-àâäéèêëïîôùûüç]/gi, "");
      doc.save(`emploi-du-temps-${safe || "vue"}.pdf`);
      toast.success("Emploi du temps téléchargé");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Téléchargement impossible",
      );
    } finally {
      setExporting(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSubjectId("");
    setTeacherId("");
    setRoom("");
  };

  const openCreate = (prefill?: { day: number; startMin: number }) => {
    const day = prefill?.day ?? todayDow ?? 1;
    const range = clockRange(prefill?.startMin ?? 8 * 60);
    setEditingId(null);
    setSubjectId("");
    setTeacherId(viewMode === "enseignant" ? filterTeacherId : "");
    setRoom(viewMode === "salle" ? filterRoom : "");
    setClassId(viewMode === "classe" ? filterClassId : "");
    setDayOfWeek(String(day));
    setStartTime(range.start);
    setEndTime(range.end);
    setShowForm(true);
  };

  const openEdit = (id: string) => {
    const slot = slots.find((item) => item.id === id);
    if (!slot) return;
    setEditingId(slot.id);
    setClassId(slot.class_section_id);
    setTeacherId(slot.teacher_id ?? "");
    setSubjectId(slot.subject_id);
    setDayOfWeek(String(slot.day_of_week));
    setStartTime(slot.start_time.slice(0, 5));
    setEndTime(slot.end_time.slice(0, 5));
    setRoom(slot.room ?? "");
    setShowForm(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!classId || !subjectId || !teacherId) {
      toast.error("Choisissez classe, matière et enseignant");
      return;
    }

    const teacher = teacherList.find((item) => item.id === teacherId);
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
    if (viewMode === "classe") setFilterClassId(classId);
    resetForm();
    void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const removeSlot = async (id: string) => {
    const { error } = await supabase.from("creneaux_edt").delete().eq("id", id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Créneau retiré");
      setPendingRemoveId(null);
      if (editingId === id) resetForm();
      void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  const pendingRemoveSlot = pendingRemoveId
    ? slots.find((slot) => slot.id === pendingRemoveId)
    : null;

  const pendingRemoveLabel = pendingRemoveSlot
    ? [
        pendingRemoveSlot.matieres?.name ?? "Créneau",
        formatDay(pendingRemoveSlot.day_of_week),
        pendingRemoveSlot.start_time && pendingRemoveSlot.end_time
          ? `${pendingRemoveSlot.start_time.slice(0, 5)}–${pendingRemoveSlot.end_time.slice(0, 5)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const formReady = Boolean(classId && subjectId && teacherId);
  const showWeekGrid = phoneLayout === "semaine";
  const dayAddLabel = `Ajouter un cours ${formatDay(selectedDay).toLowerCase()}`;

  return (
    <div>
      <SetupGuideBar />
      <ConfirmPasswordDialog
        open={!!pendingRemoveSlot}
        title={
          pendingRemoveLabel
            ? `Retirer « ${pendingRemoveLabel} » ?`
            : "Confirmer"
        }
        description="Ce créneau sera retiré de l’emploi du temps. Saisissez votre mot de passe administrateur pour confirmer."
        confirmLabel="Retirer le créneau"
        onCancel={() => setPendingRemoveId(null)}
        onVerified={async () => {
          if (pendingRemoveId) await removeSlot(pendingRemoveId);
        }}
      />
      <PageHeader
        title="Emplois du temps"
        subtitle="Lundi à samedi · cliquez une case vide pour ajouter, un cours pour le modifier"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isLoading || filteredSlots.length === 0 || exporting}
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Export…" : "PDF"}
            </Button>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Ajouter un créneau
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-[var(--surface-2)]">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={viewMode === mode.id}
              onClick={() => switchView(mode.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                viewMode === mode.id
                  ? "bg-white text-slate-900 shadow-sm dark:bg-[var(--surface)]"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {viewMode === "classe" ? (
          <Select
            aria-label="Classe"
            className="h-9 w-auto min-w-[8rem] py-0"
            value={filterClassId}
            onChange={(event) => {
              setFilterClassId(event.target.value);
              setFilterTeacherId("");
            }}
            disabled={classes.length === 0}
          >
            {classes.length === 0 ? (
              <option value="">Aucune classe</option>
            ) : (
              classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            )}
          </Select>
        ) : null}

        {viewMode === "classe" ? (
          <Select
            aria-label="Filtrer par enseignant"
            className="h-9 w-auto min-w-[10rem] py-0"
            value={filterTeacherId}
            onChange={(event) => setFilterTeacherId(event.target.value)}
          >
            <option value="">Tous les enseignants</option>
            {filterTeachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {fullName(teacher.first_name, teacher.last_name)}
              </option>
            ))}
          </Select>
        ) : null}

        {viewMode === "enseignant" ? (
          <Select
            aria-label="Enseignant"
            className="h-9 w-auto min-w-[10rem] py-0"
            value={filterTeacherId}
            onChange={(event) => setFilterTeacherId(event.target.value)}
            disabled={teacherList.length === 0}
          >
            {teacherList.length === 0 ? (
              <option value="">Aucun enseignant</option>
            ) : (
              teacherList.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {fullName(teacher.first_name, teacher.last_name)}
                </option>
              ))
            )}
          </Select>
        ) : null}

        {viewMode === "salle" ? (
          <Select
            aria-label="Salle"
            className="h-9 w-auto min-w-[8rem] py-0"
            value={filterRoom}
            onChange={(event) => setFilterRoom(event.target.value)}
            disabled={rooms.length === 0}
          >
            {rooms.length === 0 ? (
              <option value="">Aucune salle</option>
            ) : (
              rooms.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </Select>
        ) : null}

        {visibleConflicts.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("conflits-edt")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-200"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {visibleConflicts.length} conflit
            {visibleConflicts.length > 1 ? "s" : ""}
          </button>
        ) : null}

        <span className="text-sm text-slate-500">
          {formatHoursFr(plannedMinutes)} planifiées
        </span>

        <div className="ml-auto inline-flex rounded-xl bg-slate-100 p-1 md:hidden dark:bg-[var(--surface-2)]">
          {(
            [
              ["jour", "Jour"],
              ["semaine", "Semaine"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={phoneLayout === id}
              onClick={() => setPhoneLayout(id)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium",
                phoneLayout === id
                  ? "bg-brand-700 text-white"
                  : "text-slate-600",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          {isLoading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : classes.length === 0 ? (
            <EmptyState message="Créez d’abord des classes pour planifier l’emploi du temps." />
          ) : viewMode === "salle" && rooms.length === 0 ? (
            <EmptyState message="Aucune salle renseignée sur les créneaux." />
          ) : viewMode === "enseignant" && teacherList.length === 0 ? (
            <EmptyState message="Aucun enseignant actif dans l’école." />
          ) : (
            <>
            {filteredSlots.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucun créneau sur cette vue — cliquez une case vide pour en ajouter.
              </p>
            ) : null}

            <div className={showWeekGrid ? "block" : "hidden md:block"}>
              <TimetableGrid
                slots={gridSlots}
                title=""
                onSelect={openEdit}
                onEmptyClick={(day, startMin) => openCreate({ day, startMin })}
                highlightDay={todayDow}
                conflictBadges={conflictBadges}
                conflictDays={conflictDays}
                activeId={editingId}
              />
            </div>

            <div
              className={cn(
                "space-y-3 pb-24",
                showWeekGrid ? "hidden" : "md:hidden",
              )}
            >
              <TimetableDayAgenda
                slots={gridSlots}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                conflictBadges={conflictBadges}
                conflictDays={conflictDays}
                onSelectSlot={openEdit}
                onAdd={() =>
                  openCreate({
                    day: selectedDay,
                    startMin: addStartForSelectedDay,
                  })
                }
                addLabel={dayAddLabel}
              />
              <SubjectLegend names={gridSlots.map((slot) => slot.subjectName)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TimetableConflictsPanel
                conflicts={visibleConflicts}
                onOpen={openEdit}
              />
              <TimetableHoursCard slots={gridSlots} />
            </div>
            </>
          )}
        </div>

        {showForm ? (
            <TimetableEditorPanel
              mode={editingId ? "edit" : "create"}
              subtitle={panelSubtitle}
              saving={saving}
              classes={classes.map((item) => ({ id: item.id, name: item.name }))}
              classId={classId}
              onClassId={(id) => {
                setClassId(id);
                setTeacherId("");
                setSubjectId("");
              }}
              subjects={subjectsForClass.map((item) => ({
                id: item.id,
                name: item.name,
              }))}
              subjectId={subjectId}
              onSubjectId={(id) => {
                setSubjectId(id);
                const stillAssigned = assignments.some(
                  (aff) =>
                    aff.class_section_id === classId &&
                    aff.subject_id === id &&
                    aff.teacher_id === teacherId,
                );
                if (!stillAssigned) setTeacherId("");
              }}
              teachers={teachersForSubject.map((teacher) => ({
                id: teacher.id,
                name: fullName(teacher.first_name, teacher.last_name),
              }))}
              teacherId={teacherId}
              onTeacherId={setTeacherId}
              noSubjectHint={
                classId && subjectsForClass.length === 0
                  ? "Aucune matière affectée à cette classe — créez une affectation dans Enseignants."
                  : null
              }
              noTeacherHint={
                subjectId && teachersForSubject.length === 0
                  ? "Aucun enseignant n’est affecté à cette matière pour cette classe."
                  : null
              }
              dayOfWeek={dayOfWeek}
              onDayOfWeek={setDayOfWeek}
              startTime={startTime}
              endTime={endTime}
              onStartTime={setStartTime}
              onEndTime={setEndTime}
              timeOptions={TIMETABLE_TIME_OPTIONS}
              room={room}
              onRoom={setRoom}
              conflicts={liveConflicts}
              ready={formReady}
              otherClasses={otherClasses}
              onViewClass={(id) => {
                setViewMode("classe");
                setFilterClassId(id);
                setFilterTeacherId("");
                resetForm();
              }}
              otherTeachers={otherTeachers}
              subjectName={subjectName}
              freeSlotsText={freeSlotsText}
              onClose={resetForm}
              onSubmit={(event) => void handleSave(event)}
              onDelete={
                editingId ? () => setPendingRemoveId(editingId) : undefined
              }
            />
          ) : null}
        </div>

      {phoneLayout === "jour" && !showForm && classes.length > 0 ? (
        <button
          type="button"
          className="fixed right-4 bottom-5 z-40 inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-lg md:hidden"
          onClick={() =>
            openCreate({ day: selectedDay, startMin: addStartForSelectedDay })
          }
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      ) : null}
    </div>
  );
}
