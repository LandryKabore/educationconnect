import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ClipboardList, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassProgrammeRow, Subject } from "@/lib/types";
import { cn, fullName, joinProfile, matchesSearch } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import { BackLink, Button, Card, EmptyState, Input } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";

type Tab = "overview" | "programme";

type AssignmentRow = {
  id: string;
  subject_id: string;
  teacher_id: string;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

type ProgrammeRow = ClassProgrammeRow & {
  matieres: { name: string; coefficient: number } | null;
};

function initialsOf(first?: string | null, last?: string | null) {
  return `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase() || "?";
}

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, schoolId, user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "school_admin";
  const [pendingRemove, setPendingRemove] = useState<ProgrammeRow | null>(null);

  const tabParam = searchParams.get("tab");
  const tab: Tab =
    tabParam === "overview" || tabParam === "programme"
      ? tabParam
      : isAdmin
        ? "programme"
        : "overview";

  const setTab = (next: Tab) => {
    setSearchParams({ tab: next }, { replace: true });
  };

  const [pendingAdds, setPendingAdds] = useState<Record<string, string>>({});
  const [rosterSearch, setRosterSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cls, isLoading } = useQuery({
    queryKey: ["class", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, annees_scolaires(label)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as {
        name: string;
        grade_level: string | null;
        capacity: number | null;
        annees_scolaires: { label: string } | null;
      };
    },
  });

  const { data: roster = [] } = useQuery({
    // own key: the roll call keeps a different shape under ["class-roster", id]
    queryKey: ["class-roster-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select(
          "id, profils:profils!inscriptions_student_id_fkey(first_name, last_name)",
        )
        .eq("class_section_id", id!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as { id: string; profils: unknown };
        return { id: r.id, profils: joinProfile(r.profils) };
      });
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["class-assignments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "id, subject_id, teacher_id, matieres(name), profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)",
        )
        .eq("class_section_id", id!);
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId && isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as Subject[];
    },
  });

  const { data: programme = [] } = useQuery({
    queryKey: ["programme-classe", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programme_classe")
        .select("*, matieres(name, coefficient)")
        .eq("class_section_id", id!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ProgrammeRow[];
    },
  });

  const teachersBySubject = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const list = map.get(a.subject_id) ?? [];
      list.push(a);
      map.set(a.subject_id, list);
    }
    return map;
  }, [assignments]);

  const mySubjectIds = new Set(assignments.filter((a) => a.teacher_id === user?.id).map((a) => a.subject_id));
  const sortedRoster = [...roster].sort((x, y) =>
    fullName(x.profils?.first_name, x.profils?.last_name).localeCompare(fullName(y.profils?.first_name, y.profils?.last_name), "fr"),
  );

  const programmeSubjectIds = new Set(programme.map((p) => p.subject_id));
  const availableSubjects = subjects.filter((s) => !programmeSubjectIds.has(s.id));

  const orphanAssignments = assignments.filter(
    (a) => !programmeSubjectIds.has(a.subject_id),
  );

  const togglePending = (subjectId: string) => {
    setPendingAdds((prev) => {
      if (prev[subjectId] !== undefined) {
        const next = { ...prev };
        delete next[subjectId];
        return next;
      }
      return { ...prev, [subjectId]: "1" };
    });
  };

  const addSelectedToProgramme = async () => {
    if (!id) return;
    const rows = Object.entries(pendingAdds);
    if (!rows.length) {
      toast.message("Cochez au moins une matière");
      return;
    }
    for (const [, c] of rows) {
      if (!Number(c) || Number(c) <= 0) {
        toast.error("Chaque coefficient doit être > 0");
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase.from("programme_classe").insert(
      rows.map(([subject_id, coefficient]) => ({
        class_section_id: id,
        subject_id,
        coefficient: Number(coefficient),
      })),
    );
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erreur");
      return;
    }
    toast.success(`${rows.length} matière(s) ajoutée(s)`);
    setPendingAdds({});
    void qc.invalidateQueries({ queryKey: ["programme-classe", id] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["classes-with-programme", schoolId] });
  };

  const updateCoef = async (rowId: string, value: string) => {
    const coefficient = Number(value);
    if (!coefficient || coefficient <= 0) {
      toast.error("Coefficient invalide");
      return;
    }
    const { error } = await supabase
      .from("programme_classe")
      .update({ coefficient })
      .eq("id", rowId);
    if (error) toast.error("Modification impossible");
    else {
      toast.success("Coefficient mis à jour");
      void qc.invalidateQueries({ queryKey: ["programme-classe", id] });
    }
  };

  const removeFromProgramme = async (row: ProgrammeRow) => {
    if (!id) return;
    const { error } = await supabase
      .from("programme_classe")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error("Suppression impossible");
      return;
    }
    await supabase
      .from("affectations_enseignement")
      .delete()
      .eq("class_section_id", id)
      .eq("subject_id", row.subject_id);

    toast.success("Matière retirée du programme");
    setPendingRemove(null);
    void qc.invalidateQueries({ queryKey: ["programme-classe", id] });
    void qc.invalidateQueries({ queryKey: ["class-assignments", id] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["classes-with-programme", schoolId] });
    void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
  };

  if (isLoading) return <p className="text-slate-500">Chargement…</p>;
  if (!cls) {
    return (
      <div>
        <BackLink
          to={isAdmin ? "/classes" : "/mes-classes"}
          label={isAdmin ? "Retour aux classes" : "Retour aux classes"}
        />
        <EmptyState message="Classe introuvable." />
      </div>
    );
  }

  return (
    <div>
      <ConfirmPasswordDialog
        open={!!pendingRemove}
        title={
          pendingRemove
            ? `Retirer « ${pendingRemove.matieres?.name ?? "cette matière"} » du programme ?`
            : "Confirmer"
        }
        description="La matière et les affectations associées seront retirées de cette classe. Saisissez votre mot de passe administrateur pour confirmer."
        confirmLabel="Retirer du programme"
        onCancel={() => setPendingRemove(null)}
        onVerified={async () => {
          if (pendingRemove) await removeFromProgramme(pendingRemove);
        }}
      />
      <BackLink
        to={isAdmin ? "/classes" : "/mes-classes"}
        label={isAdmin ? "Retour aux classes" : "Retour aux classes"}
      />
      <PageBanner
        title={cls.name}
        subtitle={
          [cls.grade_level, cls.annees_scolaires?.label].filter(Boolean).join(" · ") ||
          undefined
        }
        stats={[
          { label: "Élèves", value: String(roster.length), hint: cls.capacity ? `capacité ${cls.capacity}` : "inscrits" },
          { label: "Matières", value: String(programme.length), hint: "au programme" },
          {
            label: isAdmin ? "Enseignants" : "Vos matières",
            value: String(isAdmin ? new Set(assignments.map((a) => a.teacher_id)).size : mySubjectIds.size),
            hint: isAdmin ? "affectés" : "dans cette classe",
          },
        ]}
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={tab === "overview" ? "primary" : "outline"}
                onClick={() => setTab("overview")}
              >
                Vue d’ensemble
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === "programme" ? "primary" : "outline"}
                onClick={() => setTab("programme")}
              >
                Programme
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Link to={`/classes/${id}/presences`}>
                <Button type="button" size="sm">
                  <Users className="h-4 w-4" />
                  Faire l’appel
                </Button>
              </Link>
              <Link to={`/classes/${id}/notes`}>
                <Button type="button" size="sm" variant="outline">
                  <ClipboardList className="h-4 w-4" />
                  Notes & évaluations
                </Button>
              </Link>
            </div>
          )
        }
      />

      {tab === "programme" && isAdmin ? (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Programme de la classe
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Corrigez les coefficients, voyez qui enseigne chaque matière, ou
                  retirez une matière de cette classe.
                </p>
              </div>
              <Link
                to="/enseignants"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Gérer les affectations →
              </Link>
            </div>

            {programme.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Aucune matière dans le programme. Ajoutez-en ci-dessous ou via{" "}
                <Link to="/programmes" className="font-medium text-brand-700 underline">
                  Programme par classe
                </Link>
                .
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-3 font-medium">Matière</th>
                      <th className="pb-2 pr-3 font-medium">Coef.</th>
                      <th className="pb-2 pr-3 font-medium">Enseignant(s)</th>
                      <th className="pb-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {programme.map((p) => {
                      const teachers = teachersBySubject.get(p.subject_id) ?? [];
                      return (
                        <tr key={p.id}>
                          <td className="py-3 pr-3 font-medium text-slate-900">
                            {p.matieres?.name ?? "—"}
                          </td>
                          <td className="py-3 pr-3">
                            <Input
                              type="number"
                              min="0.5"
                              step="0.5"
                              className="w-20"
                              key={`${p.id}-${p.coefficient}`}
                              defaultValue={String(p.coefficient)}
                              onBlur={(e) => {
                                if (e.target.value !== String(p.coefficient)) {
                                  void updateCoef(p.id, e.target.value);
                                }
                              }}
                            />
                          </td>
                          <td className="py-3 pr-3 text-slate-600">
                            {teachers.length === 0 ? (
                              <span className="text-amber-700">Non affecté</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {teachers.map((t) => (
                                  <li key={t.id}>
                                    {t.profils
                                      ? fullName(
                                          t.profils.first_name,
                                          t.profils.last_name,
                                        )
                                      : "—"}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => setPendingRemove(p)}
                            >
                              Retirer
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {orphanAssignments.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">
                  Affectations hors programme ({orphanAssignments.length})
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {orphanAssignments.map((a) => (
                    <li key={a.id}>
                      {a.matieres?.name ?? "Matière"} —{" "}
                      {a.profils
                        ? fullName(a.profils.first_name, a.profils.last_name)
                        : "—"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          {availableSubjects.length > 0 ? (
            <Card>
              <h3 className="font-semibold text-slate-900">
                Ajouter des matières
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {Object.keys(pendingAdds).length} cochée(s)
              </p>
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {availableSubjects.map((s) => {
                  const checked = pendingAdds[s.id] !== undefined;
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
                        checked ? "bg-brand-50" : "hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-700"
                        checked={checked}
                        onChange={() => togglePending(s.id)}
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {s.name}
                      </span>
                      {checked ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Coef.</span>
                          <Input
                            type="number"
                            min="0.5"
                            step="0.5"
                            className="h-9 w-16 px-2"
                            value={pendingAdds[s.id]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setPendingAdds((prev) => ({
                                ...prev,
                                [s.id]: e.target.value,
                              }))
                            }
                          />
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <Button
                className="mt-3"
                disabled={saving || Object.keys(pendingAdds).length === 0}
                onClick={() => void addSelectedToProgramme()}
              >
                {saving ? "Ajout…" : "Ajouter la sélection"}
              </Button>
            </Card>
          ) : subjects.length > 0 ? (
            <p className="text-sm text-slate-500">
              Toutes les matières du catalogue sont déjà dans le programme.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6 lg:h-[calc(100dvh-24.5rem)] lg:min-h-[320px] lg:grid-cols-12">
          {/* ── Students ── */}
          <Card className="flex min-h-0 flex-col p-0 lg:col-span-7">
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-[var(--border)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                <Users className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Élèves</h3>
                <p className="text-xs text-slate-500">
                  {roster.length} inscrit{roster.length > 1 ? "s" : ""}
                  {cls.capacity ? ` sur ${cls.capacity} places` : ""}
                </p>
              </div>
              <label className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Chercher un élève"
                  className="h-9 rounded-md pl-9"
                />
              </label>
            </div>
            {roster.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Aucun élève dans cette classe.</p>
            ) : (
              <ol className="grid min-h-0 flex-1 content-start overflow-y-auto sm:grid-cols-2">
                {sortedRoster
                  .filter((r) => matchesSearch(rosterSearch, r.profils?.first_name, r.profils?.last_name))
                  .map((row, i) => (
                    <li
                      key={row.id}
                      title={fullName(row.profils?.first_name, row.profils?.last_name)}
                      className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5 dark:border-[var(--border)] sm:odd:border-r"
                    >
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                        {initialsOf(row.profils?.first_name, row.profils?.last_name)}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        <PersonName first={row.profils?.first_name} last={row.profils?.last_name} />
                      </span>
                    </li>
                  ))}
              </ol>
            )}
          </Card>

          {/* ── Subjects ── */}
          <Card className="flex min-h-0 flex-col p-0 lg:col-span-5">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-[var(--border)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                <BookOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Matières de la classe</h3>
                <p className="text-xs text-slate-500">Coefficients et enseignants</p>
              </div>
              {isAdmin ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setTab("programme")}>
                  Programme
                </Button>
              ) : null}
            </div>
            {programme.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Aucune matière au programme.</p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-[var(--border)]">
                {[...programme]
                  .sort((x, y) => Number(mySubjectIds.has(y.subject_id)) - Number(mySubjectIds.has(x.subject_id)) || Number(y.coefficient) - Number(x.coefficient))
                  .map((p) => {
                    const teachers = teachersBySubject.get(p.subject_id) ?? [];
                    const names = teachers
                      .map((t) => (t.profils ? fullName(t.profils.first_name, t.profils.last_name) : null))
                      .filter(Boolean);
                    const mine = mySubjectIds.has(p.subject_id);
                    return (
                      <li key={p.id} className={cn("flex items-center gap-3 px-5 py-3", mine && "bg-brand-50/60 dark:bg-brand-950/20")}>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {p.matieres?.name ?? "—"}
                            </span>
                            {mine ? (
                              <span className="rounded-md bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Vous</span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {names.length ? names.join(", ") : <span className="text-amber-700">Non affecté</span>}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-700 dark:bg-[var(--surface-2)] dark:text-slate-200">
                          coef. {String(p.coefficient).replace(".", ",")}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
