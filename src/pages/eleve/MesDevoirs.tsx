import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isPast, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
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

export default function MesDevoirs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["mes-devoirs", user?.id],
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
      toast.success("Devoir rendu");
      void qc.invalidateQueries({ queryKey: ["mes-devoirs", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mes devoirs"
        subtitle="Consultez et rendez vos devoirs"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : assignments.length === 0 ? (
        <EmptyState message="Aucun devoir assigné." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const submission = a.rendus_devoirs?.[0];
            const done = !!submission?.submitted_at;
            const overdue =
              !done &&
              a.due_date &&
              isPast(parseISO(a.due_date.length === 10 ? `${a.due_date}T23:59:59` : a.due_date));
            const busy = busyId === a.id;
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-sm text-slate-500">
                      {a.matieres?.name ?? "—"}
                      {a.max_score ? ` · / ${a.max_score}` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      done ? "success" : overdue ? "danger" : "warning"
                    }
                  >
                    {done ? "Rendu" : overdue ? "En retard" : "À faire"}
                  </Badge>
                </div>
                {a.description ? (
                  <p className="mt-2 text-sm text-slate-600">{a.description}</p>
                ) : null}
                {a.due_date ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Échéance :{" "}
                    {format(new Date(a.due_date), "d MMMM yyyy", {
                      locale: fr,
                    })}
                  </p>
                ) : null}

                {done ? (
                  <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
                    <p className="font-medium text-emerald-900">
                      Rendu le{" "}
                      {submission.submitted_at
                        ? format(
                            new Date(submission.submitted_at),
                            "d MMM yyyy à HH:mm",
                            { locale: fr },
                          )
                        : "—"}
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
                      placeholder="Écrivez votre devoir ici…"
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
                      {busy ? "Envoi…" : "Rendre le devoir"}
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
