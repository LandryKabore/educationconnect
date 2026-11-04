import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { BookOpenCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { dbDayOfWeek } from "@/lib/timetableSchedule";
import { Modal } from "@/components/Modal";
import {
  Badge,
  Button,
  Card,
  DateInputFr,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const longDate = (s: string) => format(new Date(`${s}T12:00:00`), "EEEE d MMMM", { locale: fr });

type SlotRow = {
  id: string;
  class_section_id: string;
  subject_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  matieres: { name: string } | null;
  classes: { name: string } | null;
};

type Entry = {
  id: string;
  class_section_id: string;
  subject_id: string;
  creneau_id: string | null;
  entry_date: string;
  content: string;
  homework: string | null;
  homework_due: string | null;
  matieres: { name: string } | null;
  classes: { name: string } | null;
};

type Assignment = {
  class_section_id: string;
  subject_id: string;
  matieres: { name: string } | null;
  classes: { name: string } | null;
};

type Draft = {
  entryId: string | null;
  creneauId: string | null;
  classId: string;
  subjectId: string;
  label: string;
  date: string;
  content: string;
  homework: string;
  due: string;
};

const hhmm = (t: string) => t.slice(0, 5);

/** Teacher: write what was taught and the homework for each lesson of the day (prefilled from the timetable). */
export default function CahierTextes() {
  const { user, schoolId } = useAuth();
  const qc = useQueryClient();
  const [date, setDate] = useState(iso(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraKey, setExtraKey] = useState("");

  const dow = dbDayOfWeek(new Date(`${date}T12:00:00`));
  const isSunday = new Date(`${date}T12:00:00`).getDay() === 0;

  const { data: slots = [] } = useQuery({
    queryKey: ["cahier-slots", user?.id, schoolId],
    enabled: !!user?.id && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux_edt")
        .select("id, class_section_id, subject_id, day_of_week, start_time, end_time, matieres(name), classes!inner(name, school_id)")
        .eq("teacher_id", user!.id)
        .eq("classes.school_id", schoolId!)
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as SlotRow[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["cahier-affectations", user?.id, schoolId],
    enabled: !!user?.id && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, subject_id, matieres(name), classes!inner(name, school_id)")
        .eq("teacher_id", user!.id)
        .eq("classes.school_id", schoolId!);
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["cahier-mes-entrees", user?.id, schoolId],
    enabled: !!user?.id && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cahier_entrees")
        .select("id, class_section_id, subject_id, creneau_id, entry_date, content, homework, homework_due, matieres(name), classes(name)")
        .eq("teacher_id", user!.id)
        .eq("school_id", schoolId!)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const daySlots = useMemo(() => slots.filter((s) => s.day_of_week === dow && !isSunday), [slots, dow, isSunday]);
  const dayEntries = useMemo(() => entries.filter((e) => e.entry_date === date), [entries, date]);
  const entryForSlot = (slotId: string) => dayEntries.find((e) => e.creneau_id === slotId);
  const freeEntries = dayEntries.filter((e) => !e.creneau_id);

  const openSlot = (s: SlotRow) => {
    const e = entryForSlot(s.id);
    setDraft({
      entryId: e?.id ?? null,
      creneauId: s.id,
      classId: s.class_section_id,
      subjectId: s.subject_id,
      label: `${s.matieres?.name ?? "Cours"} · ${s.classes?.name ?? ""} · ${hhmm(s.start_time)}–${hhmm(s.end_time)}`,
      date,
      content: e?.content ?? "",
      homework: e?.homework ?? "",
      due: e?.homework_due ?? "",
    });
  };

  const openEntry = (e: Entry) =>
    setDraft({
      entryId: e.id,
      creneauId: e.creneau_id,
      classId: e.class_section_id,
      subjectId: e.subject_id,
      label: `${e.matieres?.name ?? "Cours"} · ${e.classes?.name ?? ""}`,
      date: e.entry_date,
      content: e.content,
      homework: e.homework ?? "",
      due: e.homework_due ?? "",
    });

  const openExtra = () => {
    const a = assignments.find((x) => `${x.class_section_id}|${x.subject_id}` === extraKey);
    if (!a) {
      toast.error("Choisissez une classe et une matière");
      return;
    }
    setExtraOpen(false);
    setDraft({
      entryId: null,
      creneauId: null,
      classId: a.class_section_id,
      subjectId: a.subject_id,
      label: `${a.matieres?.name ?? "Cours"} · ${a.classes?.name ?? ""}`,
      date,
      content: "",
      homework: "",
      due: "",
    });
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["cahier-mes-entrees"] });
    void qc.invalidateQueries({ queryKey: ["cahier-feed"] });
    void qc.invalidateQueries({ queryKey: ["cahier-couverture"] });
    void qc.invalidateQueries({ queryKey: ["devoirs-demain"] });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const content = draft.content.trim();
    const homework = draft.homework.trim();
    if (!content && !homework) {
      toast.error("Écrivez le contenu du cours ou le travail à faire");
      return;
    }
    if (draft.due && !homework) {
      toast.error("Une date de rendu demande un travail à faire");
      return;
    }
    if (draft.due && draft.due < draft.date) {
      toast.error("La date de rendu ne peut pas être avant le cours");
      return;
    }
    setSaving(true);
    try {
      if (draft.entryId) {
        const { error } = await supabase
          .from("cahier_entrees")
          .update({ content, homework: homework || null, homework_due: homework ? draft.due || null : null })
          .eq("id", draft.entryId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cahier_entrees").insert({
          class_section_id: draft.classId,
          subject_id: draft.subjectId,
          creneau_id: draft.creneauId,
          entry_date: draft.date,
          content,
          homework: homework || null,
          homework_due: homework ? draft.due || null : null,
        });
        if (error) throw error;
      }
      toast.success("Cahier de textes enregistré");
      setDraft(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Supprimer cette saisie du cahier de textes ?")) return;
    const { error } = await supabase.from("cahier_entrees").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saisie supprimée");
    setDraft(null);
    refresh();
  };

  const entryLine = (e: Entry) => (
    <div className="mt-2 space-y-1 text-sm text-slate-700">
      {e.content ? <p>{e.content}</p> : null}
      {e.homework ? (
        <p>
          <Badge tone="warning">À faire</Badge> {e.homework}
          {e.homework_due ? <span className="text-slate-500"> · pour le {longDate(e.homework_due)}</span> : null}
        </p>
      ) : null}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Cahier de textes"
        subtitle="Ce qui a été fait en cours et le travail à faire. Les élèves et les parents le voient."
        actions={
          <Button size="sm" variant="outline" onClick={() => setExtraOpen(true)} disabled={assignments.length === 0}>
            <Plus className="mr-1 h-4 w-4" />
            Autre cours
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Jour</Label>
            <DateInputFr value={date} onChange={(v) => v && setDate(v)} minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear() + 1} />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setDate(iso(new Date()))}>
            Aujourd'hui
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDate(iso(addDays(new Date(`${date}T12:00:00`), -1)))}>
            ← Veille
          </Button>
        </div>
        <p className="mt-2 text-sm font-medium capitalize text-slate-600">{longDate(date)}</p>
      </Card>

      <h2 className="mb-3 font-semibold text-slate-900">Mes cours de ce jour</h2>
      {daySlots.length === 0 && freeEntries.length === 0 ? (
        <EmptyState
          message={isSunday ? "Pas de cours le dimanche." : "Aucun cours dans votre emploi du temps ce jour-là. Utilisez « Autre cours » si besoin."}
        />
      ) : (
        <div className="space-y-3">
          {daySlots.map((s) => {
            const e = entryForSlot(s.id);
            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {s.matieres?.name ?? "Cours"} · {s.classes?.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {hhmm(s.start_time)}–{hhmm(s.end_time)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e ? <Badge tone="success">Rempli</Badge> : <Badge tone="warning">À remplir</Badge>}
                    <Button size="sm" variant={e ? "outline" : "primary"} onClick={() => openSlot(s)}>
                      {e ? <Pencil className="mr-1 h-3.5 w-3.5" /> : <BookOpenCheck className="mr-1 h-3.5 w-3.5" />}
                      {e ? "Modifier" : "Remplir"}
                    </Button>
                  </div>
                </div>
                {e ? entryLine(e) : null}
              </Card>
            );
          })}
          {freeEntries.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">
                  {e.matieres?.name ?? "Cours"} · {e.classes?.name} <span className="text-sm font-normal text-slate-500">(hors emploi du temps)</span>
                </p>
                <Button size="sm" variant="outline" onClick={() => openEntry(e)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Modifier
                </Button>
              </div>
              {entryLine(e)}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Mes dernières saisies</h2>
      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : entries.length === 0 ? (
        <EmptyState message="Rien dans le cahier de textes pour le moment." />
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 20).map((e) => (
            <Card key={e.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium capitalize text-slate-900">
                  {longDate(e.entry_date)} · {e.matieres?.name} · {e.classes?.name}
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEntry(e)} aria-label="Modifier">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(e.id)} aria-label="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {entryLine(e)}
            </Card>
          ))}
        </div>
      )}

      <Modal open={extraOpen} title="Autre cours" onClose={() => setExtraOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Pour un cours qui n'est pas dans votre emploi du temps (rattrapage, remplacement…).</p>
          <div>
            <Label>Classe et matière</Label>
            <Select value={extraKey} onChange={(e) => setExtraKey(e.target.value)}>
              <option value="">Choisir…</option>
              {assignments.map((a) => (
                <option key={`${a.class_section_id}|${a.subject_id}`} value={`${a.class_section_id}|${a.subject_id}`}>
                  {a.classes?.name} · {a.matieres?.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={openExtra}>Continuer</Button>
        </div>
      </Modal>

      <Modal open={draft !== null} title={draft?.entryId ? "Modifier la saisie" : "Cahier de textes"} onClose={() => setDraft(null)} closeDisabled={saving}>
        {draft ? (
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm font-medium text-slate-700">
              {draft.label} · <span className="capitalize">{longDate(draft.date)}</span>
            </p>
            <div>
              <Label htmlFor="cahier-contenu">Ce qui a été fait en cours</Label>
              <Textarea
                id="cahier-contenu"
                value={draft.content}
                maxLength={2000}
                placeholder="Ex. Les fractions : addition et soustraction, exercices 1 à 4."
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cahier-devoir">Travail à faire (facultatif)</Label>
              <Textarea
                id="cahier-devoir"
                value={draft.homework}
                maxLength={1000}
                className="min-h-20"
                placeholder="Ex. Refaire l'exercice 5 page 42 et apprendre la leçon."
                onChange={(e) => setDraft({ ...draft, homework: e.target.value })}
              />
            </div>
            {draft.homework.trim() ? (
              <div>
                <Label>Pour quand ?</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <DateInputFr value={draft.due} onChange={(v) => setDraft({ ...draft, due: v })} minYear={new Date().getFullYear() - 1} maxYear={new Date().getFullYear() + 1} />
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, due: iso(addDays(new Date(`${draft.date}T12:00:00`), 1)) })}>
                    Lendemain
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...draft, due: iso(addDays(new Date(`${draft.date}T12:00:00`), 7)) })}>
                    Dans 1 semaine
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setDraft(null)}>
                Annuler
              </Button>
              {draft.entryId ? (
                <Button type="button" variant="ghost" disabled={saving} onClick={() => void remove(draft.entryId!)}>
                  Supprimer
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
