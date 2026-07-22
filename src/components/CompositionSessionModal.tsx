import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fullName } from "@/lib/utils";
import type { Profile, Subject } from "@/lib/types";
import { Modal } from "@/components/Modal";
import { Button, Input, Label, Select, TimeInput24 } from "@/components/ui";

const PERIODS = ["Trimestre 1", "Trimestre 2", "Trimestre 3"];

export type PaperDraft = {
  subjectId: string;
  subjectName: string;
  included: boolean;
  teacherId: string;
  evalDate: string;
  startTime: string;
  endTime: string;
  maxScore: string;
};

type Assignment = {
  teacher_id: string;
  class_section_id: string;
  subject_id: string;
};

type Props = {
  open: boolean;
  classId: string;
  className: string;
  /** When provided, shows a class picker at the top of the form. */
  classes?: { id: string; name: string }[];
  onClassIdChange?: (classId: string) => void;
  schoolId: string;
  userId: string;
  teachers: Profile[];
  assignments: Assignment[];
  subjects: Subject[];
  defaultPeriod: string;
  onClose: () => void;
  onSaved: () => void;
};

function defaultPeriodLabel(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 9) return "Trimestre 1";
  if (month <= 3) return "Trimestre 2";
  return "Trimestre 3";
}

export function CompositionSessionModal({
  open,
  classId,
  className,
  classes,
  onClassIdChange,
  userId,
  teachers,
  assignments,
  subjects,
  defaultPeriod,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState(defaultPeriod || defaultPeriodLabel());
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [papers, setPapers] = useState<PaperDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: programme = [], isLoading: programmeLoading } = useQuery({
    queryKey: ["programme-classe", classId],
    enabled: open && !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient, matieres(id, name)")
        .eq("class_section_id", classId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as {
        subject_id: string;
        coefficient: number;
        matieres: { id: string; name: string } | null;
      }[];
    },
  });

  const subjectRows = useMemo(() => {
    if (programme.length > 0) {
      return programme
        .map((p) => ({
          id: p.subject_id,
          name: p.matieres?.name ?? subjects.find((s) => s.id === p.subject_id)?.name ?? "Matière",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }
    // Fallback: matières taught in this class via affectations.
    const ids = new Set(
      assignments
        .filter((a) => a.class_section_id === classId)
        .map((a) => a.subject_id),
    );
    return subjects
      .filter((s) => ids.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [programme, assignments, classId, subjects]);

  const teachersForSubject = (subjectId: string) => {
    const ids = new Set(
      assignments
        .filter(
          (a) =>
            a.class_section_id === classId && a.subject_id === subjectId,
        )
        .map((a) => a.teacher_id),
    );
    const list = teachers.filter((t) => ids.has(t.id));
    return list.length > 0 ? list : teachers;
  };

  // Rebuild paper drafts when programme / date range changes.
  useEffect(() => {
    if (!open) return;
    setPapers((prev) => {
      const bySubject = new Map(prev.map((p) => [p.subjectId, p]));
      return subjectRows.map((s) => {
        const existing = bySubject.get(s.id);
        if (existing) {
          return {
            ...existing,
            subjectName: s.name,
            evalDate:
              existing.evalDate || startsOn || existing.evalDate,
          };
        }
        const teacherOpts = teachersForSubject(s.id);
        return {
          subjectId: s.id,
          subjectName: s.name,
          included: true,
          teacherId: teacherOpts[0]?.id ?? "",
          evalDate: startsOn || "",
          startTime: "08:00",
          endTime: "10:00",
          maxScore: "20",
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rebuild when subject list or startsOn seed changes
  }, [open, subjectRows, startsOn]);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setPeriod(defaultPeriod || defaultPeriodLabel());
    setStartsOn("");
    setEndsOn("");
    setPapers([]);
  }, [open, classId, defaultPeriod]);

  const updatePaper = (subjectId: string, patch: Partial<PaperDraft>) => {
    setPapers((prev) =>
      prev.map((p) => (p.subjectId === subjectId ? { ...p, ...patch } : p)),
    );
  };

  const included = papers.filter((p) => p.included);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !userId) return;
    if (!title.trim()) {
      toast.error("Donnez un titre à la composition");
      return;
    }
    if (!startsOn || !endsOn) {
      toast.error("Indiquez les dates de début et de fin");
      return;
    }
    if (endsOn < startsOn) {
      toast.error("La date de fin doit être après la date de début");
      return;
    }
    if (included.length === 0) {
      toast.error("Cochez au moins une matière");
      return;
    }

    for (const p of included) {
      if (!p.teacherId) {
        toast.error(`Choisissez un enseignant pour ${p.subjectName}`);
        return;
      }
      if (!p.evalDate) {
        toast.error(`Indiquez la date pour ${p.subjectName}`);
        return;
      }
      if (p.evalDate < startsOn || p.evalDate > endsOn) {
        toast.error(
          `La date de ${p.subjectName} doit être entre ${startsOn} et ${endsOn}`,
        );
        return;
      }
      if (!p.startTime || !p.endTime || p.startTime >= p.endTime) {
        toast.error(`Créneau invalide pour ${p.subjectName}`);
        return;
      }
      const max = Number(p.maxScore);
      if (!Number.isFinite(max) || max <= 0) {
        toast.error(`Note max invalide pour ${p.subjectName}`);
        return;
      }
    }

    setSaving(true);
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await supabase
      .from("composition_sessions")
      .insert({
        class_section_id: classId,
        period_label: period,
        title: title.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
        created_by: userId,
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      setSaving(false);
      toast.error(sessionError?.message || "Création de la session impossible");
      return;
    }

    const payload = included.map((p) => ({
      class_section_id: classId,
      subject_id: p.subjectId,
      teacher_id: p.teacherId,
      period_label: period,
      type: "composition" as const,
      title: `${title.trim()} — ${p.subjectName}`,
      max_score: Number(p.maxScore),
      eval_date: p.evalDate,
      start_time: p.startTime,
      end_time: p.endTime,
      admin_confirmed: true,
      confirmed_at: now,
      confirmed_by: userId,
      session_id: session.id as string,
    }));

    const { error: papersError } = await supabase
      .from("evaluations")
      .insert(payload);
    setSaving(false);

    if (papersError) {
      // Roll back empty session if papers failed.
      await supabase.from("composition_sessions").delete().eq("id", session.id);
      toast.error(papersError.message || "Création des épreuves impossible");
      return;
    }

    toast.success(
      `Composition créée — ${payload.length} épreuve${payload.length > 1 ? "s" : ""}`,
    );
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`Composition — ${className}`}
      onClose={onClose}
      closeDisabled={saving}
      size="xl"
    >
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          Session de 2–3 jours : toutes les matières du programme sont
          listées. Cochez celles à inclure, puis renseignez date et horaire
          pour chaque épreuve. Les enseignants noteront ensuite dans
          Devoirs & évaluations.
        </p>

        {classes && classes.length > 0 && onClassIdChange ? (
          <div>
            <Label>Classe</Label>
            <Select
              value={classId}
              onChange={(e) => onClassIdChange(e.target.value)}
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div>
          <Label>Titre</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex. Composition du 1er trimestre"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Période</Label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Du</Label>
            <Input
              type="date"
              value={startsOn}
              onChange={(e) => {
                setStartsOn(e.target.value);
                if (!endsOn || endsOn < e.target.value) {
                  setEndsOn(e.target.value);
                }
              }}
              required
            />
          </div>
          <div>
            <Label>Au</Label>
            <Input
              type="date"
              value={endsOn}
              min={startsOn || undefined}
              onChange={(e) => setEndsOn(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label>Épreuves ({included.length}/{papers.length})</Label>
            {papers.length > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() =>
                  setPapers((prev) =>
                    prev.map((p) => ({
                      ...p,
                      included: !prev.every((x) => x.included),
                    })),
                  )
                }
              >
                {papers.every((p) => p.included)
                  ? "Tout décocher"
                  : "Tout cocher"}
              </button>
            ) : null}
          </div>

          {programmeLoading ? (
            <p className="text-sm text-slate-500">Chargement du programme…</p>
          ) : papers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              Aucune matière au programme de cette classe. Ajoutez-en dans
              Programmes, ou affectez des enseignants.
            </p>
          ) : (
            <div className="max-h-[min(50vh,28rem)] space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
              {papers.map((p) => {
                const teacherOpts = teachersForSubject(p.subjectId);
                return (
                  <div
                    key={p.subjectId}
                    className={
                      "rounded-xl border px-3 py-2.5 " +
                      (p.included
                        ? "border-brand-200 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-950/20"
                        : "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/40")
                    }
                  >
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={p.included}
                        onChange={(e) =>
                          updatePaper(p.subjectId, {
                            included: e.target.checked,
                          })
                        }
                      />
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {p.subjectName}
                      </span>
                    </label>
                    {p.included ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="sm:col-span-2 lg:col-span-2">
                          <Label>Enseignant</Label>
                          <Select
                            value={p.teacherId}
                            onChange={(e) =>
                              updatePaper(p.subjectId, {
                                teacherId: e.target.value,
                              })
                            }
                            required
                          >
                            <option value="">Choisir…</option>
                            {teacherOpts.map((t) => (
                              <option key={t.id} value={t.id}>
                                {fullName(t.first_name, t.last_name)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={p.evalDate}
                            min={startsOn || undefined}
                            max={endsOn || undefined}
                            onChange={(e) =>
                              updatePaper(p.subjectId, {
                                evalDate: e.target.value,
                              })
                            }
                            required
                          />
                        </div>
                        <div>
                          <Label>Début</Label>
                          <TimeInput24
                            value={p.startTime}
                            onChange={(v) =>
                              updatePaper(p.subjectId, { startTime: v })
                            }
                            required
                          />
                        </div>
                        <div>
                          <Label>Fin</Label>
                          <TimeInput24
                            value={p.endTime}
                            onChange={(v) =>
                              updatePaper(p.subjectId, { endTime: v })
                            }
                            required
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={saving || included.length === 0 || !startsOn || !endsOn}
          >
            {saving
              ? "Création…"
              : `Créer la composition (${included.length})`}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </form>
    </Modal>
  );
}
