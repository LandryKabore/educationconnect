import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignmentKindCreateLabel,
  assignmentKindCreatedToast,
  assignmentKindDueLabel,
  assignmentKindEmpty,
  assignmentKindLabel,
  type AssignmentKind,
} from "@/lib/assignmentKinds";
import { supabase } from "@/lib/supabase";
import type { Assignment, ClassSection, Subject } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

type Props = {
  kind: AssignmentKind;
};

export default function Devoirs({ kind }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["devoirs", user?.id, kind],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devoirs")
        .select("*, classes(name), matieres(name)")
        .eq("teacher_id", user!.id)
        .eq("kind", kind)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (Assignment & {
        classes: { name: string };
        matieres: { name: string };
      })[];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["teacher-class-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("classes(*)")
        .eq("teacher_id", user!.id);
      const map = new Map<string, ClassSection>();
      for (const row of data ?? []) {
        const c = (row as unknown as { classes: ClassSection }).classes;
        if (c) map.set(c.id, c);
      }
      return sortClassesByProgression([...map.values()]);
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["teacher-subjects", user?.id, classId],
    enabled: !!user?.id && !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("affectations_enseignement")
        .select("matieres(*)")
        .eq("teacher_id", user!.id)
        .eq("class_section_id", classId);
      return (data ?? []).map(
        (r) => (r as unknown as { matieres: Subject }).matieres,
      );
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !classId || !subjectId) return;
    const { error } = await supabase.from("devoirs").insert({
      class_section_id: classId,
      subject_id: subjectId,
      teacher_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      kind,
    });
    if (error) {
      toast.error(error.message || "Erreur lors de la création");
      return;
    }
    toast.success(assignmentKindCreatedToast(kind));
    setTitle("");
    setDescription("");
    setDueDate("");
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["devoirs", user.id, kind] });
  };

  return (
    <div>
      <PageHeader
        title={assignmentKindLabel(kind, true)}
        subtitle={
          kind === "examen"
            ? "Contrôles et examens pour vos classes"
            : "Travaux à faire à la maison"
        }
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            {assignmentKindCreateLabel(kind)}
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label>Classe</Label>
              <Select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
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
              <Label>Matière</Label>
              <Select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
              >
                <option value="">Choisir…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Titre</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>{assignmentKindDueLabel(kind)}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Créer</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : assignments.length === 0 ? (
        <EmptyState message={assignmentKindEmpty(kind)} />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Card key={a.id}>
              <h3 className="font-semibold">{a.title}</h3>
              <p className="text-sm text-slate-500">
                {a.classes?.name} — {a.matieres?.name}
              </p>
              {a.description ? (
                <p className="mt-2 text-sm text-slate-600">{a.description}</p>
              ) : null}
              {a.due_date ? (
                <p className="mt-1 text-xs text-slate-400">
                  {kind === "examen" ? "Le " : "À rendre avant le "}
                  {format(new Date(a.due_date), "d MMMM yyyy", { locale: fr })}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExercicesMaisonPage() {
  return <Devoirs kind="exercice_maison" />;
}

export function ExamensPage() {
  return <Devoirs kind="examen" />;
}
