import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button, DateInputFr, Label, Textarea } from "@/components/ui";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

type Entry = { id: string; content: string; homework: string | null; homework_due: string | null };

/**
 * The cahier de textes of ONE lesson (timetable slot + date): what was done and the homework.
 * Same rules as the cahier page: content or homework required, a due date needs homework,
 * and it cannot be before the lesson.
 */
export function CahierLessonForm({
  slotId,
  classId,
  subjectId,
  date,
  onSaved,
}: {
  slotId: string;
  classId: string;
  subjectId: string;
  date: string;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { data: entry, isLoading } = useQuery({
    queryKey: ["cahier-lesson", slotId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cahier_entrees")
        .select("id, content, homework, homework_due")
        .eq("creneau_id", slotId)
        .eq("entry_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Entry | null;
    },
  });

  const [content, setContent] = useState("");
  const [homework, setHomework] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContent(entry?.content ?? "");
    setHomework(entry?.homework ?? "");
    setDue(entry?.homework_due ?? "");
  }, [entry]);

  const dirty =
    content !== (entry?.content ?? "") || homework !== (entry?.homework ?? "") || due !== (entry?.homework_due ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = content.trim();
    const h = homework.trim();
    if (!c && !h) {
      toast.error("Écrivez le contenu du cours ou le travail à faire");
      return;
    }
    if (due && !h) {
      toast.error("Une date de rendu demande un travail à faire");
      return;
    }
    if (due && due < date) {
      toast.error("La date de rendu ne peut pas être avant le cours");
      return;
    }
    setSaving(true);
    try {
      if (entry) {
        const { error } = await supabase
          .from("cahier_entrees")
          .update({ content: c, homework: h || null, homework_due: h ? due || null : null })
          .eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cahier_entrees").insert({
          class_section_id: classId,
          subject_id: subjectId,
          creneau_id: slotId,
          entry_date: date,
          content: c,
          homework: h || null,
          homework_due: h ? due || null : null,
        });
        if (error) throw error;
      }
      toast.success("Cahier de textes enregistré");
      for (const key of ["cahier-lesson", "cahier-mes-entrees", "cahier-feed", "cahier-couverture", "devoirs-demain", "teacher-lessons", "teacher-todo", "teacher-exercices", "mes-devoirs", "enfant-devoirs"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">Chargement…</p>;

  const lessonDay = new Date(`${date}T12:00:00`);

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-5">
      {entry && !dirty ? (
        <p className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Rempli — visible par les élèves et les parents
        </p>
      ) : null}
      <div>
        <Label htmlFor="cahier-contenu">Ce qui a été fait en cours</Label>
        <Textarea
          id="cahier-contenu"
          value={content}
          maxLength={2000}
          placeholder="Ex. Les fractions : addition et soustraction, exercices 1 à 4."
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="cahier-devoir">Travail à faire (facultatif)</Label>
        <Textarea
          id="cahier-devoir"
          value={homework}
          maxLength={1000}
          className="min-h-20"
          placeholder="Ex. Refaire l'exercice 5 page 42 et apprendre la leçon."
          onChange={(e) => setHomework(e.target.value)}
        />
      </div>
      {homework.trim() ? (
        <div>
          <Label>Pour quand ?</Label>
          <div className="flex flex-wrap items-center gap-2">
            <DateInputFr
              value={due}
              onChange={(v) => setDue(v)}
              minYear={new Date().getFullYear() - 1}
              maxYear={new Date().getFullYear() + 1}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => setDue(iso(addDays(lessonDay, 1)))}>
              Lendemain
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDue(iso(addDays(lessonDay, 7)))}>
              Dans 1 semaine
            </Button>
          </div>
          {due ? (
            <p className="mt-1 text-xs text-slate-500">
              Pour le {format(new Date(`${due}T12:00:00`), "EEEE d MMMM", { locale: fr })}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || (!!entry && !dirty)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Enregistrement…" : entry ? (dirty ? "Mettre à jour" : "Enregistré ✓") : "Enregistrer le cahier"}
        </Button>
        {dirty ? <span className="text-sm text-amber-700">Modifications non enregistrées</span> : null}
      </div>
    </form>
  );
}
