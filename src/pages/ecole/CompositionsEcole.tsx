import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CompositionSessionModal } from "@/components/CompositionSessionModal";
import { ClassColorDot } from "@/components/ClassColor";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import { useAuth } from "@/contexts/AuthContext";
import { formatExamSchedule } from "@/lib/assignmentKinds";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatDateSafe } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile, Subject } from "@/lib/types";
import { joinProfile } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

function currentPeriodLabel(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 9) return "Trimestre 1";
  if (month <= 3) return "Trimestre 2";
  return "Trimestre 3";
}

type SessionRow = {
  id: string;
  title: string;
  period_label: string;
  starts_on: string;
  ends_on: string;
  class_section_id: string;
  classes: { id: string; name: string } | null;
  papers: {
    id: string;
    eval_date: string | null;
    start_time: string | null;
    end_time: string | null;
    matieres: { name: string } | null;
  }[];
};

export default function CompositionsEcole() {
  const { schoolId, user } = useAuth();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formClassId, setFormClassId] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SessionRow | null>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return sortClassesByProgression((data ?? []) as ClassSection[]);
    },
  });

  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const classNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classes) m.set(c.id, c.name);
    return m;
  }, [classes]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["enseignants-profils", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "teacher")
        .eq("active", true);
      return (roles ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
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

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["ecole-compositions", schoolId, classId],
    enabled: !!schoolId && classIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("composition_sessions")
        .select(
          "id, title, period_label, starts_on, ends_on, class_section_id, classes(id, name)",
        )
        .in("class_section_id", classId ? [classId] : classIds)
        .order("starts_on", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as unknown as {
        id: string;
        title: string;
        period_label: string;
        starts_on: string;
        ends_on: string;
        class_section_id: string;
        classes: { id: string; name: string } | null;
      }[];
      if (list.length === 0) return [] as SessionRow[];

      const { data: papers } = await supabase
        .from("evaluations")
        .select(
          "id, session_id, eval_date, start_time, end_time, matieres(name)",
        )
        .in(
          "session_id",
          list.map((s) => s.id),
        )
        .eq("type", "composition")
        .order("eval_date", { ascending: true });

      type Paper = SessionRow["papers"][number] & { session_id: string };
      const bySession = new Map<string, SessionRow["papers"]>();
      for (const p of (papers ?? []) as unknown as Paper[]) {
        const listP = bySession.get(p.session_id) ?? [];
        listP.push(p);
        bySession.set(p.session_id, listP);
      }

      return list.map(
        (s): SessionRow => ({
          ...s,
          papers: bySession.get(s.id) ?? [],
        }),
      );
    },
  });

  const openCreate = () => {
    const initial = classId || classes[0]?.id || "";
    if (!initial) {
      toast.error("Créez d’abord une classe");
      return;
    }
    setFormClassId(initial);
    setShowForm(true);
  };

  const handleDelete = async (session: SessionRow) => {
    setDeletingId(session.id);
    // Papers have session_id ON DELETE SET NULL — delete papers first, then session.
    const { error: papersError } = await supabase
      .from("evaluations")
      .delete()
      .eq("session_id", session.id);
    if (papersError) {
      setDeletingId(null);
      toast.error(papersError.message || "Suppression impossible");
      return;
    }
    const { error } = await supabase
      .from("composition_sessions")
      .delete()
      .eq("id", session.id);
    setDeletingId(null);
    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success("Composition supprimée");
    setPendingDelete(null);
    void qc.invalidateQueries({ queryKey: ["ecole-compositions"] });
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ecole-compositions"] });
    void qc.invalidateQueries({ queryKey: ["evaluations"] });
    void qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] });
    void qc.invalidateQueries({ queryKey: ["teacher-home"] });
    void qc.invalidateQueries({ queryKey: ["student-home"] });
    void qc.invalidateQueries({ queryKey: ["ecole-home"] });
  };

  const sessionGroups = useMemo(() => {
    const byClass = new Map<string, SessionRow[]>();
    for (const session of sessions) {
      const id = session.class_section_id || session.classes?.id || "_";
      const list = byClass.get(id) ?? [];
      list.push(session);
      byClass.set(id, list);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    }
    const knownIds = classes.map((c) => c.id).filter((id) => byClass.has(id));
    const orphanIds = [...byClass.keys()].filter((id) => !knownIds.includes(id));
    return [...knownIds, ...orphanIds].map((id) => {
      const rows = byClass.get(id)!;
      return {
        classId: id,
        className:
          rows[0]?.classes?.name ??
          classes.find((c) => c.id === id)?.name ??
          "Classe",
        sessions: rows,
      };
    });
  }, [sessions, classes]);

  return (
    <div>
      <ConfirmPasswordDialog
        open={!!pendingDelete}
        title={
          pendingDelete
            ? `Supprimer « ${pendingDelete.title} » ?`
            : "Confirmer"
        }
        description="Cette composition et toutes ses épreuves seront définitivement retirées. Saisissez votre mot de passe administrateur pour confirmer."
        confirmLabel="Supprimer la composition"
        onCancel={() => setPendingDelete(null)}
        onVerified={async () => {
          if (pendingDelete) await handleDelete(pendingDelete);
        }}
      />
      <PageHeader
        title="Compositions"
        subtitle="Sessions multi-matières sur 2–3 jours — planifiées par l’administration"
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle composition
          </Button>
        }
      />

      <div className="mb-6 max-w-sm">
        <Label htmlFor="compo-classe">Classe</Label>
        <Select
          id="compo-classe"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : sessions.length === 0 ? (
        <EmptyState message="Aucune composition pour cette sélection. Créez-en une pour une classe." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {sessionGroups.map((group) => (
            <section
              key={group.classId}
              className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <h2 className="mb-3 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <ClassColorDot id={group.classId} name={group.className} />
                {group.className}
                <span className="text-sm font-normal text-slate-500">
                  {group.sessions.length} composition
                  {group.sessions.length > 1 ? "s" : ""}
                </span>
              </h2>
              <div className="space-y-3">
                {group.sessions.map((session) => (
                  <Card key={session.id} className="h-full">
                    <div className="flex h-full flex-col gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                            {session.title}
                          </h3>
                          <Badge tone="success">Planifiée</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {session.period_label}
                          <span> · </span>
                          {formatDateSafe(session.starts_on, "d MMM", {
                            locale: fr,
                          })}
                          {" – "}
                          {formatDateSafe(session.ends_on, "d MMM yyyy", {
                            locale: fr,
                          })}
                          <span> · </span>
                          {session.papers.length} épreuve
                          {session.papers.length !== 1 ? "s" : ""}
                        </p>
                        {session.papers.length > 0 ? (
                          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 dark:border-slate-700">
                            {session.papers.map((paper) => {
                              const slot = formatExamSchedule({
                                due_date: paper.eval_date,
                                start_time: paper.start_time,
                                end_time: paper.end_time,
                              });
                              return (
                                <li
                                  key={paper.id}
                                  className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"
                                >
                                  <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                                  <span>
                                    <span className="font-medium text-slate-800 dark:text-slate-100">
                                      {paper.matieres?.name ?? "Matière"}
                                    </span>
                                    {paper.eval_date
                                      ? ` · ${formatDateSafe(paper.eval_date, "EEE d MMM", { locale: fr })}`
                                      : ""}
                                    {slot ? ` · ${slot}` : ""}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={deletingId === session.id}
                        onClick={() => setPendingDelete(session)}
                        className="w-full text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm && formClassId && user && schoolId ? (
        <CompositionSessionModal
          open={showForm}
          classId={formClassId}
          className={classNameById.get(formClassId) ?? "classe"}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          onClassIdChange={setFormClassId}
          schoolId={schoolId}
          userId={user.id}
          teachers={teachers}
          assignments={assignments}
          subjects={subjects}
          defaultPeriod={currentPeriodLabel()}
          onClose={() => setShowForm(false)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );
}
