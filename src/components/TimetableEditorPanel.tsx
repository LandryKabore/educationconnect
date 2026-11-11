import { useEffect, useId, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { formatDay } from "@/lib/pdfBulletin";
import { Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

export type EditorConflict = {
  type: string;
  message: string;
};

type Option = { id: string; name: string };

type Props = {
  mode: "create" | "edit";
  subtitle: string;
  saving: boolean;
  classes: Option[];
  classId: string;
  onClassId: (id: string) => void;
  subjects: Option[];
  subjectId: string;
  onSubjectId: (id: string) => void;
  teachers: Option[];
  teacherId: string;
  onTeacherId: (id: string) => void;
  noSubjectHint?: string | null;
  noTeacherHint?: string | null;
  dayOfWeek: string;
  onDayOfWeek: (day: string) => void;
  startTime: string;
  endTime: string;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
  timeOptions: string[];
  room: string;
  onRoom: (value: string) => void;
  conflicts: EditorConflict[];
  ready: boolean;
  otherClasses: Option[];
  onViewClass: (classId: string) => void;
  otherTeachers: Option[];
  subjectName?: string | null;
  freeSlotsText?: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onDelete?: () => void;
};

export function TimetableEditorPanel(props: Props) {
  const titleId = useId();
  const [showOthers, setShowOthers] = useState(false);
  const title = props.mode === "edit" ? "Modifier le créneau" : "Ajouter un créneau";
  const blocked = props.conflicts.length > 0;

  useEffect(() => {
    setShowOthers(false);
  }, [props.subjectId, props.mode]);

  const { onClose, saving } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-slate-900/40 md:hidden"
        aria-label="Fermer le panneau"
        onClick={() => {
          if (!props.saving) props.onClose();
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[70] max-h-[88vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl",
          "md:sticky md:top-4 md:z-auto md:max-h-[calc(100vh-5rem)] md:w-[22.5rem] md:shrink-0 md:self-start md:overflow-y-auto md:rounded-2xl md:p-4 md:shadow-sm md:inset-auto",
          "dark:border-[var(--border)] dark:bg-[var(--surface)]",
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 md:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {props.subtitle ? (
              <p className="mt-0.5 text-sm text-slate-500">{props.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.saving}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={props.onSubmit} className="space-y-3">
          <div>
            <Label>Classe</Label>
            <Select
              value={props.classId}
              onChange={(event) => props.onClassId(event.target.value)}
              required
            >
              <option value="">Choisir…</option>
              {props.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Matière</Label>
            <Select
              value={props.subjectId}
              onChange={(event) => props.onSubjectId(event.target.value)}
              required
              disabled={!props.classId}
            >
              <option value="">
                {!props.classId
                  ? "Choisissez d’abord une classe"
                  : props.subjects.length === 0
                    ? "Aucune matière affectée"
                    : "Choisir…"}
              </option>
              {props.subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            {props.noSubjectHint ? (
              <p className="mt-1 text-xs text-amber-700">{props.noSubjectHint}</p>
            ) : null}
          </div>

          <div>
            <Label>Enseignant</Label>
            <Select
              value={props.teacherId}
              onChange={(event) => props.onTeacherId(event.target.value)}
              required
              disabled={!props.subjectId}
            >
              <option value="">
                {!props.subjectId
                  ? "Choisissez d’abord une matière"
                  : props.teachers.length === 0
                    ? "Aucun enseignant pour cette matière"
                    : "Choisir…"}
              </option>
              {props.teachers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            {props.noTeacherHint ? (
              <p className="mt-1 text-xs text-amber-700">{props.noTeacherHint}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Jour</Label>
              <Select
                value={props.dayOfWeek}
                onChange={(event) => props.onDayOfWeek(event.target.value)}
              >
                {[1, 2, 3, 4, 5, 6].map((day) => (
                  <option key={day} value={day}>
                    {formatDay(day)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Début</Label>
              <Select
                value={props.startTime}
                onChange={(event) => props.onStartTime(event.target.value)}
                required
              >
                {props.timeOptions.map((time) => (
                  <option key={`start-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Fin</Label>
              <Select
                value={props.endTime}
                onChange={(event) => props.onEndTime(event.target.value)}
                required
              >
                {props.timeOptions.map((time) => (
                  <option key={`end-${time}`} value={time}>
                    {time}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Salle</Label>
            <Input
              value={props.room}
              onChange={(event) => props.onRoom(event.target.value)}
              placeholder="ex. Salle 3"
            />
          </div>

          {props.conflicts.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {props.conflicts.length > 1
                  ? `${props.conflicts.length} conflits détectés`
                  : "Conflit détecté"}
              </p>
              <ul className="list-inside list-disc space-y-1">
                {props.conflicts.map((conflict, index) => (
                  <li key={`${conflict.type}-${index}`}>{conflict.message}</li>
                ))}
              </ul>
            </div>
          ) : props.ready ? (
            <p className="text-sm text-emerald-700">Aucun conflit pour ce créneau.</p>
          ) : null}

          {props.otherClasses.length > 0 || props.otherTeachers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {props.otherClasses.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => props.onViewClass(item.id)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-800"
                >
                  Voir {item.name}
                </button>
              ))}
              {props.otherTeachers.length > 0 && props.subjectName ? (
                <button
                  type="button"
                  onClick={() => setShowOthers((open) => !open)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-800"
                >
                  Autres profs de {props.subjectName}
                </button>
              ) : null}
            </div>
          ) : null}

          {showOthers && props.otherTeachers.length > 0 ? (
            <ul className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
              {props.otherTeachers.map((teacher) => (
                <li key={teacher.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white"
                    onClick={() => {
                      props.onTeacherId(teacher.id);
                      setShowOthers(false);
                    }}
                  >
                    {teacher.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {props.freeSlotsText ? (
            <p className="text-xs leading-relaxed text-slate-500">
              {props.freeSlotsText}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={props.saving || blocked || !props.ready}
          >
            {props.saving
              ? "Enregistrement…"
              : blocked
                ? props.mode === "edit"
                  ? "Enregistrer (conflit à régler)"
                  : "Ajouter (conflit à régler)"
                : props.mode === "edit"
                  ? "Enregistrer"
                  : "Ajouter"}
          </Button>
        </form>

        {props.onDelete ? (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={props.onDelete}
              disabled={props.saving}
              className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              Supprimer ce créneau…
            </button>
            <p className="mt-1 text-xs text-slate-500">
              Confirmation par mot de passe administrateur.
            </p>
          </div>
        ) : null}
      </aside>
    </>
  );
}
