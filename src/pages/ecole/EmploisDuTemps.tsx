import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatDay } from "@/lib/pdfBulletin";
import { generateEmploiDuTempsPdf } from "@/lib/pdfEmploiDuTemps";
import { findTimetableConflicts } from "@/lib/timetableConflicts";
import type { ClassSection, Subject, TimetableSlot } from "@/lib/types";
import { fullName } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import { Modal } from "@/components/Modal";
import { ClassColorBadge } from "@/components/ClassColor";
import {
  TimetableGrid,
  type TimetableGridSlot,
} from "@/components/TimetableGrid";
import { useSchoolTimetableRealtime } from "@/hooks/useStudentTimetableUpdates";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
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
  const { schoolId, schools } = useAuth();
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
  const [exporting, setExporting] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const schoolName =
    schools.find((s) => s.id === schoolId)?.name ?? "École";

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

  const handleDownloadPdf = () => {
    if (!filterClassId) {
      toast.message("Sélectionnez une classe");
      return;
    }
    if (filteredSlots.length === 0) {
      toast.message("Aucun créneau à exporter");
      return;
    }
    setExporting(true);
    try {
      const className =
        classes.find((c) => c.id === filterClassId)?.name ?? "—";
      const teacher = filterTeacherId
        ? teachers.find((t) => t?.id === filterTeacherId)
        : null;
      const teacherLabel = teacher
        ? fullName(teacher.first_name, teacher.last_name)
        : null;
      const doc = generateEmploiDuTempsPdf({
        schoolName,
        className,
        extraLine: teacherLabel ? `Enseignant : ${teacherLabel}` : null,
        slots: filteredSlots.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          subjectName: s.matieres?.name ?? "Matière",
          teacherName: s.profils
            ? fullName(s.profils.first_name, s.profils.last_name)
            : null,
          room: s.room,
        })),
      });
      const safeClass = className
        .replace(/\s+/g, "-")
        .replace(/[^\w\-àâäéèêëïîôùûüç]/gi, "");
      doc.save(`emploi-du-temps-${safeClass || "classe"}.pdf`);
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

  const openCreate = () => {
    setEditingId(null);
    setSubjectId("");
    setTeacherId("");
    setDayOfWeek("1");
    setStartTime("08:00");
    setEndTime("09:00");
    setRoom("");
    setClassId(filterClassId || classId || "");
    setShowForm(true);
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
    const { error } = await supabase.from("creneaux_edt").delete().eq("id", id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Créneau retiré");
      setPendingRemoveId(null);
      void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  const pendingRemoveSlot = pendingRemoveId
    ? slots.find((s) => s.id === pendingRemoveId)
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
        subtitle="Lundi à samedi · conflits classe, enseignant et salle"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={
                isLoading ||
                !filterClassId ||
                filteredSlots.length === 0 ||
                exporting
              }
              onClick={handleDownloadPdf}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Export…" : "Télécharger PDF"}
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

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Créez d’abord des classes pour planifier l’emploi du temps." />
      ) : (
        <div className="space-y-3">
          {filteredSlots.length === 0 ? (
            <EmptyState message="Aucun créneau pour cette classe — ajoutez-en pour remplir la grille." />
          ) : null}
          <TimetableGrid
            slots={gridSlots}
            title={`Emploi du temps — ${classNameById.get(filterClassId) ?? "classe"}`}
            onSelect={openEdit}
            onRemove={(id) => setPendingRemoveId(id)}
          />
        </div>
      )}
    </div>
  );
}
