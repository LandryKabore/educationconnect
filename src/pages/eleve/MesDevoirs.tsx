import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignmentKindEmpty,
  assignmentKindLabel,
  assignmentKindSubmitLabel,
  assignmentKindSubmittedToast,
  type AssignmentKind,
} from "@/lib/assignmentKinds";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { Assignment } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
} from "@/components/ui";

type DevoirRow = Assignment & {
  matieres: { name: string } | null;
  rendus_devoirs: {
    id: string;
    score: number | null;
    submitted_at: string | null;
    content: string | null;
  }[];
};

type Props = {
  kind: AssignmentKind;
};

export default function MesDevoirs({ kind }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["mes-devoirs", user?.id, kind],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      if (!enrollment) return [];

      const { data, error } = await supabase
        .from("devoirs")
        .select(
          "*, matieres(name), rendus_devoirs!left(id, score, submitted_at, content)",
        )
        .eq(
          "class_section_id",
          (enrollment as { class_section_id: string }).class_section_id,
        )
        .eq("kind", kind)
        .eq("rendus_devoirs.student_id", user!.id)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as DevoirRow[];
    },
  });

  const submit = async (assignment: DevoirRow) => {
    if (!user) return;
    const content = (drafts[assignment.id] ?? "").trim();
    if (!content) {
      toast.error("Écrivez votre réponse avant de rendre");
      return;
    }
    setBusyId(assignment.id);
    try {
      const existing = assignment.rendus_devoirs?.[0];
      if (existing?.id) {
        const { error } = await supabase
          .from("rendus_devoirs")
          .update({
            content,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("student_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rendus_devoirs").insert({
          assignment_id: assignment.id,
          student_id: user.id,
          content,
          submitted_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      toast.success(assignmentKindSubmittedToast(kind));
      void qc.invalidateQueries({ queryKey: ["mes-devoirs", user.id, kind] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={
          kind === "examen"
            ? "Mes examens"
            : "Mes exercices de maison"
        }
        subtitle={
          kind === "examen"
            ? "Consultez et rendez vos examens"
            : "Consultez et rendez vos exercices"
        }
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : assignments.length === 0 ? (
        <EmptyState message={assignmentKindEmpty(kind)} />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const submission = a.rendus_devoirs?.[0];
            const done = !!submission?.submitted_at;
            const dueAt = parseValidDate(
              a.due_date?.length === 10
                ? `${a.due_date}T23:59:59`
                : a.due_date,
            );
            const overdue = !done && !!dueAt && isPast(dueAt);
            const busy = busyId === a.id;
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-sm text-slate-500">
                      {a.matieres?.name ?? "—"}
                      {a.max_score ? ` · / ${a.max_score}` : ""}
                      {" · "}
                      {assignmentKindLabel(kind)}
                    </p>
                  </div>
                  <Badge
                    tone={done ? "success" : overdue ? "danger" : "warning"}
                  >
                    {done ? "Rendu" : overdue ? "En retard" : "À faire"}
                  </Badge>
                </div>
                {a.description ? (
                  <p className="mt-2 text-sm text-slate-600">{a.description}</p>
                ) : null}
                {a.due_date ? (
                  <p className="mt-1 text-xs text-slate-400">
                    {kind === "examen" ? "Date : " : "Échéance : "}
                    {formatDateSafe(a.due_date, "d MMMM yyyy", {
                      locale: fr,
                    })}
                  </p>
                ) : null}

                {done ? (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
                    <p className="font-medium text-emerald-900">
                      Rendu le{" "}
                      {formatDateSafe(
                        submission.submitted_at,
                        "d MMM yyyy à HH:mm",
                        { locale: fr },
                      )}
                    </p>
                    {submission.content ? (
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">
                        {submission.content}
                      </p>
                    ) : null}
                    {submission.score != null ? (
                      <p className="mt-2 font-semibold text-brand-700">
                        Note : {submission.score}
                        {a.max_score ? ` / ${a.max_score}` : ""}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        En attente de notation par l’enseignant
                      </p>
                    )}
                    <div className="mt-3">
                      <Label htmlFor={`edit-${a.id}`}>Modifier votre rendu</Label>
                      <textarea
                        id={`edit-${a.id}`}
                        className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                        value={drafts[a.id] ?? submission.content ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [a.id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        className="mt-2"
                        size="sm"
                        disabled={busy}
                        onClick={() => void submit(a)}
                      >
                        {busy ? "Envoi…" : "Mettre à jour"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Label htmlFor={`rendu-${a.id}`}>Votre réponse</Label>
                    <textarea
                      id={`rendu-${a.id}`}
                      className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                      placeholder={
                        kind === "examen"
                          ? "Écrivez votre examen ici…"
                          : "Écrivez votre exercice ici…"
                      }
                      value={drafts[a.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [a.id]: e.target.value,
                        }))
                      }
                    />
                    <Button
                      className="mt-2"
                      disabled={busy}
                      onClick={() => void submit(a)}
                    >
                      {busy ? "Envoi…" : assignmentKindSubmitLabel(kind)}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MesExercicesPage() {
  return <MesDevoirs kind="exercice_maison" />;
}

export function MesExamensPage() {
  return <MesDevoirs kind="examen" />;
}
