import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile, Subject } from "@/lib/types";
import { compareClassesByProgression, sortClassesByProgression } from "@/lib/classCatalog";
import { fromAuthEmail, fullName, matchesSearch } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Modal } from "@/components/Modal";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

type TeacherCredential = {
  username: string;
  tempPassword: string | null;
  used: boolean;
};

type AssignmentRow = {
  id: string;
  teacher_id: string;
  class_section_id: string;
  subject_id: string;
  classes: { name: string } | null;
  matieres: { name: string } | null;
};

const ASSIGNMENTS_PREVIEW = 4;

function groupAssignmentsByClass(assignments: AssignmentRow[]) {
  const map = new Map<
    string,
    { className: string; items: AssignmentRow[] }
  >();
  for (const a of assignments) {
    const key = a.class_section_id || a.classes?.name || "_";
    const existing = map.get(key);
    if (existing) existing.items.push(a);
    else {
      map.set(key, {
        className: a.classes?.name ?? "Classe",
        items: [a],
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.className.localeCompare(b.className, "fr"),
  );
}

export default function Enseignants() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(
    () =>
      searchParams.get("assign") === "1" && !!searchParams.get("teacher"),
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [subjectsByClassSelection, setSubjectsByClassSelection] = useState<
    Record<string, string[]>
  >({});
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedAssignments, setExpandedAssignments] = useState<
    Record<string, boolean>
  >({});
  const [pendingRemove, setPendingRemove] = useState<AssignmentRow | null>(
    null,
  );
  const openAssign = (preselectTeacherId: string) => {
    setShowAssign(true);
    setShowForm(false);
    setTeacherId(preselectTeacherId);
    setClassIds([]);
    setSubjectsByClassSelection({});
    const next = new URLSearchParams(searchParams);
    next.set("assign", "1");
    next.set("teacher", preselectTeacherId);
    setSearchParams(next, { replace: true });
  };

  const closeAssign = () => {
    setShowAssign(false);
    setTeacherId("");
    setClassIds([]);
    setSubjectsByClassSelection({});
    const next = new URLSearchParams(searchParams);
    next.delete("assign");
    next.delete("teacher");
    setSearchParams(next, { replace: true });
  };

  const openCreate = () => {
    setShowForm(true);
    closeAssign();
  };

  const closeCreate = () => {
    setShowForm(false);
    setFirstName("");
    setLastName("");
  };

  useEffect(() => {
    const assign = searchParams.get("assign") === "1";
    const teacher = searchParams.get("teacher");
    if (assign && teacher) {
      setShowAssign(true);
      setShowForm(false);
      setTeacherId(teacher);
    }
  }, [searchParams]);

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["enseignants", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "teacher")
        .eq("active", true);
      if (error) throw error;
      return (roles ?? []).map(
        (r) => (r as unknown as { profils: Profile }).profils,
      );
    },
  });

  const teacherIds = useMemo(() => teachers.map((t) => t.id), [teachers]);

  const { data: credentialsByUser = {} } = useQuery({
    queryKey: ["identifiants-enseignants", schoolId, teacherIds.join(",")],
    enabled: !!schoolId && teacherIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("identifiants_temporaires")
        .select("user_id, username, temp_password_hint, used")
        .in("user_id", teacherIds);
      if (error) throw error;
      const map: Record<string, TeacherCredential> = {};
      for (const row of data ?? []) {
        map[row.user_id as string] = {
          username: row.username as string,
          tempPassword: (row.temp_password_hint as string | null) ?? null,
          used: Boolean(row.used),
        };
      }
      return map;
    },
  });

  const credentialFor = (t: Profile): TeacherCredential => {
    const stored = credentialsByUser[t.id];
    if (stored) return stored;
    return {
      username: fromAuthEmail(t.email) || "—",
      tempPassword: null,
      used: false,
    };
  };

  const invalidateTeacherQueries = () => {
    void qc.invalidateQueries({ queryKey: ["enseignants", schoolId] });
    void qc.invalidateQueries({ queryKey: ["identifiants-enseignants", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const runCredentialAction = async (
    teacher: Profile,
    action: "reset_password" | "recovery_link",
  ) => {
    if (!schoolId) return;
    setBusyId(teacher.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "gerer-identifiant",
        {
          body: {
            action,
            userId: teacher.id,
            schoolId,
            redirectTo: `${window.location.origin}/premiere-connexion`,
          },
        },
      );
      if (error) throw error;
      const res = data as {
        error?: string;
        tempPassword?: string;
        username?: string;
        recoveryLink?: string;
      };
      if (res.error) throw new Error(res.error);

      if (action === "reset_password" && res.tempPassword) {
        const creds = `${res.username}\n${res.tempPassword}`;
        toast.success("Nouveau mot de passe temporaire", {
          description: `${res.username ?? ""} · ${res.tempPassword}`,
          action: {
            label: "Copier",
            onClick: () => void copyToClipboard(creds),
          },
          duration: 30_000,
        });
        invalidateTeacherQueries();
      } else if (action === "recovery_link" && res.recoveryLink) {
        const copied = await copyToClipboard(res.recoveryLink);
        if (copied) {
          toast.success("Lien de réinitialisation copié", {
            description: "Envoyez-le à l’enseignant.",
            duration: 12_000,
          });
        } else {
          toast.success("Lien de réinitialisation", {
            description: res.recoveryLink,
            duration: 60_000,
          });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  };

  const { data: classesRaw = [] } = useQuery({
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
    () => sortClassesByProgression(classesRaw),
    [classesRaw],
  );

  const {
    data: subjectsByClass = {},
    isFetching: loadingClassSubjects,
  } = useQuery({
    queryKey: [
      "programme-classe-subjects-by-class",
      schoolId,
      classIds.slice().sort().join(","),
    ],
    enabled: !!schoolId && classIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, programme_classe(subject_id, matieres(*))")
        .eq("school_id", schoolId!)
        .in("id", classIds);
      if (error) throw error;

      const selected = new Set(classIds);
      const map: Record<string, Subject[]> = {};
      for (const id of classIds) map[id] = [];

      const seen = new Map<string, Set<string>>();
      for (const cls of data ?? []) {
        const classSectionId = cls.id as string;
        if (!selected.has(classSectionId)) continue;
        const rows = (
          cls as unknown as {
            programme_classe?: {
              subject_id: string;
              matieres: Subject | null;
            }[] | null;
          }
        ).programme_classe;
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const s = row.matieres;
          if (!s) continue;
          const used = seen.get(classSectionId) ?? new Set<string>();
          if (used.has(s.id)) continue;
          used.add(s.id);
          seen.set(classSectionId, used);
          map[classSectionId].push(s);
        }
      }

      for (const id of Object.keys(map)) {
        map[id].sort((a, b) =>
          a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
        );
      }
      return map;
    },
  });

  const toggleClass = (id: string) => {
    setClassIds((prev) => {
      if (prev.includes(id)) {
        setSubjectsByClassSelection((subjects) => {
          const next = { ...subjects };
          delete next[id];
          return next;
        });
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleSubject = (classId: string, subjectId: string) => {
    setSubjectsByClassSelection((prev) => {
      const current = prev[classId] ?? [];
      const next = current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId];
      return { ...prev, [classId]: next };
    });
  };

  const allSubjectsChosen =
    classIds.length > 0 &&
    classIds.every((id) => (subjectsByClassSelection[id] ?? []).length > 0);

  const { data: assignments = [] } = useQuery({
    queryKey: ["affectations", schoolId, "v4"],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: schoolClasses, error: classError } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", schoolId!);
      if (classError) throw classError;
      const classList = (schoolClasses ?? []) as { id: string; name: string }[];
      if (classList.length === 0) return [] as AssignmentRow[];

      const nameById = new Map(classList.map((c) => [c.id, c.name]));
      const ids = classList.map((c) => c.id);
      const rows: AssignmentRow[] = [];
      const chunkSize = 50;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("affectations_enseignement")
          .select("id, teacher_id, class_section_id, subject_id, matieres(name)")
          .in("class_section_id", chunk);
        if (error) throw error;
        for (const a of data ?? []) {
          const classId = a.class_section_id as string;
          rows.push({
            id: a.id as string,
            teacher_id: a.teacher_id as string,
            class_section_id: classId,
            subject_id: a.subject_id as string,
            classes: { name: nameById.get(classId) ?? "—" },
            matieres: (a as unknown as { matieres: { name: string } | null })
              .matieres,
          });
        }
      }
      return rows;
    },
  });

  const assignmentsByTeacher = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const list = map.get(a.teacher_id) ?? [];
      list.push(a);
      map.set(a.teacher_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const byClass = compareClassesByProgression(
          { name: a.classes?.name ?? "" },
          { name: b.classes?.name ?? "" },
        );
        if (byClass !== 0) return byClass;
        return (a.matieres?.name ?? "").localeCompare(
          b.matieres?.name ?? "",
          "fr",
        );
      });
    }
    return map;
  }, [assignments]);

  const sortedTeachers = useMemo(
    () =>
      [...teachers].sort((a, b) =>
        fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
        ),
      ),
    [teachers],
  );

  const filteredTeachers = useMemo(
    () =>
      sortedTeachers.filter((t) => {
        const cred = credentialsByUser[t.id];
        return matchesSearch(
          search,
          t.first_name,
          t.last_name,
          t.phone,
          cred?.username,
          fromAuthEmail(t.email),
        );
      }),
    [sortedTeachers, search, credentialsByUser],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setCreating(true);

    const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
      body: {
        role: "teacher",
        schoolId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      },
    });

    if (error) {
      toast.error("La création a échoué");
      setCreating(false);
      return;
    }

    const res = data as {
      username?: string;
      tempPassword?: string;
      userId?: string;
      error?: string;
    };
    if (res.error) {
      toast.error(res.error);
      setCreating(false);
      return;
    }

    toast.success(
      res.username
        ? `Compte créé — identifiant ${res.username}`
        : "Enseignant créé",
    );
    closeCreate();
    if (res.userId) openAssign(res.userId);

    void qc.invalidateQueries({ queryKey: ["enseignants", schoolId] });
    void qc.invalidateQueries({ queryKey: ["identifiants-enseignants", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    setCreating(false);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || classIds.length === 0 || !allSubjectsChosen) {
      toast.error("Choisissez au moins une matière pour chaque classe");
      return;
    }
    setAssigning(true);
    let ok = 0;
    let skipped = 0;
    for (const classSectionId of classIds) {
      const subjectIds = subjectsByClassSelection[classSectionId] ?? [];
      for (const subjectId of subjectIds) {
        const { error } = await supabase
          .from("affectations_enseignement")
          .insert({
            teacher_id: teacherId,
            class_section_id: classSectionId,
            subject_id: subjectId,
          });
        if (error) {
          if (error.message.includes("duplicate") || error.code === "23505") {
            skipped += 1;
          } else {
            setAssigning(false);
            toast.error(error.message || "Erreur lors de l’affectation");
            return;
          }
        } else {
          ok += 1;
        }
      }
    }

    setAssigning(false);
    if (ok > 0) {
      toast.success(
        ok === 1
          ? "Affectation enregistrée"
          : `${ok} affectations enregistrées`,
      );
      void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
      closeAssign();
      return;
    }
    if (skipped > 0) {
      toast.message(
        skipped === 1
          ? "1 affectation existait déjà"
          : `${skipped} affectations existaient déjà`,
      );
    }
    setSubjectsByClassSelection({});
    setClassIds([]);
    void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const removeAssignment = async (assignment: AssignmentRow) => {
    const { error } = await supabase
      .from("affectations_enseignement")
      .delete()
      .eq("id", assignment.id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Affectation retirée");
      setPendingRemove(null);
      void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  return (
    <div>
      <SetupGuideBar />
      <ConfirmPasswordDialog
        open={!!pendingRemove}
        title={
          pendingRemove
            ? `Retirer « ${pendingRemove.classes?.name ?? "classe"} · ${pendingRemove.matieres?.name ?? "matière"} » ?`
            : "Confirmer"
        }
        description="Cette affectation sera retirée pour cet enseignant. Saisissez votre mot de passe administrateur pour confirmer."
        confirmLabel="Retirer l’affectation"
        onCancel={() => setPendingRemove(null)}
        onVerified={async () => {
          if (pendingRemove) await removeAssignment(pendingRemove);
        }}
      />
      <PageHeader
        title="Enseignants"
        subtitle="Comptes, identifiants et affectations par enseignant"
        actions={
          <Button type="button" onClick={openCreate}>
            Nouvel enseignant
          </Button>
        }
      />

      {showForm ? (
        <Modal
          open={showForm}
          title="Nouvel enseignant"
          onClose={closeCreate}
          closeDisabled={creating}
        >
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Prénom</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? "Création…" : "Créer"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={creating}
                  onClick={closeCreate}
                >
                  Annuler
                </Button>
              </div>
            </form>
        </Modal>
      ) : null}

      {showAssign ? (
        <Modal
          open={showAssign}
          title="Affecter un enseignant"
          onClose={closeAssign}
          closeDisabled={assigning}
        >
            <form onSubmit={(e) => void handleAssign(e)} className="space-y-4">
              <div>
                <Label>Enseignant</Label>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
                  {fullName(
                    sortedTeachers.find((t) => t.id === teacherId)?.first_name,
                    sortedTeachers.find((t) => t.id === teacherId)?.last_name,
                  ) || "Enseignant sélectionné"}
                </p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label>Classes</Label>
                  <span className="text-xs text-slate-500">
                    {classIds.length} sélectionnée
                    {classIds.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {classes.length === 0 ? (
                    <p className="px-2 py-1.5 text-sm text-slate-400">
                      Aucune classe
                    </p>
                  ) : (
                    classes.map((c) => {
                      const checked = classIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                            checked={checked}
                            onChange={() => toggleClass(c.id)}
                          />
                          <span className="text-slate-800">{c.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {classIds.length > 0 ? (
                <div className="space-y-3">
                  <Label>Matières par classe</Label>
                  <p className="text-xs text-slate-500">
                    Cochez une ou plusieurs matières pour chaque classe.
                  </p>
                  {loadingClassSubjects ? (
                    <p className="text-sm text-slate-500">Chargement…</p>
                  ) : (
                    classIds.map((id) => {
                      const cls = classes.find((c) => c.id === id);
                      const subjects = subjectsByClass[id] ?? [];
                      const selected = subjectsByClassSelection[id] ?? [];
                      return (
                        <div
                          key={id}
                          className="rounded-xl border border-slate-200 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">
                              {cls?.name ?? "Classe"}
                            </p>
                            <span className="text-xs text-slate-500">
                              {selected.length} matière
                              {selected.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          {subjects.length === 0 ? (
                            <p className="text-xs text-amber-700">
                              Définissez le programme de cette classe d’abord.
                            </p>
                          ) : (
                            <div className="max-h-36 space-y-1 overflow-y-auto">
                              {subjects.map((s) => {
                                const checked = selected.includes(s.id);
                                return (
                                  <label
                                    key={s.id}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                                      checked={checked}
                                      onChange={() => toggleSubject(id, s.id)}
                                    />
                                    <span className="text-slate-800">
                                      {s.name}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={
                    assigning ||
                    !teacherId ||
                    classIds.length === 0 ||
                    !allSubjectsChosen
                  }
                >
                  {assigning ? "Enregistrement…" : "Enregistrer l’affectation"}
                </Button>
                <Button type="button" variant="ghost" onClick={closeAssign}>
                  Annuler
                </Button>
              </div>
            </form>
        </Modal>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : sortedTeachers.length === 0 ? (
        <EmptyState message="Aucun enseignant. Créez le premier compte." />
      ) : (
        <div className="space-y-4">
          <div className="max-w-md">
            <Label htmlFor="search-enseignants">Rechercher</Label>
            <Input
              id="search-enseignants"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, identifiant…"
            />
          </div>
          {filteredTeachers.length === 0 ? (
            <EmptyState message="Aucun enseignant ne correspond à la recherche." />
          ) : (
            <div className="space-y-3">
              {filteredTeachers.map((t) => {
                const cred = credentialFor(t);
                const teacherAssignments = assignmentsByTeacher.get(t.id) ?? [];
                const busy = busyId === t.id;
                const expanded = !!expandedAssignments[t.id];
                const classGroups = groupAssignmentsByClass(teacherAssignments);
                const hasMore = classGroups.length > ASSIGNMENTS_PREVIEW;
                const visibleGroups =
                  expanded || !hasMore
                    ? classGroups
                    : classGroups.slice(0, ASSIGNMENTS_PREVIEW);
                const hiddenCount = classGroups.length - visibleGroups.length;
                return (
                  <Card key={t.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {fullName(t.first_name, t.last_name)}
                        </h3>
                        {t.phone ? (
                          <p className="text-sm text-slate-500">{t.phone}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-slate-500">Identifiant</span>
                          <Badge>{cred.username}</Badge>
                          {cred.tempPassword && !cred.used ? (
                            <>
                              <span className="text-slate-500">Mot de passe</span>
                              <Badge tone="warning">{cred.tempPassword}</Badge>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Mot de passe temporaire non affiché
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void runCredentialAction(t, "reset_password")
                          }
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" />
                          {busy ? "…" : "Nouveau mot de passe"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void runCredentialAction(t, "recovery_link")
                          }
                        >
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          Lien oublié
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openAssign(t.id)}
                        >
                          {teacherAssignments.length > 0
                            ? "Affecter à d’autres classes"
                            : "Affecter à une classe"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                      {teacherAssignments.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          Pas encore affecté
                        </p>
                      ) : (
                        <>
                          <ul className="space-y-3">
                            {visibleGroups.map((group) => {
                              const groupKey = `${t.id}:${group.className}`;
                              const subjectsOpen =
                                !!expandedAssignments[groupKey] ||
                                group.items.length <= 3;
                              const subjects = subjectsOpen
                                ? group.items
                                : group.items.slice(0, 3);
                              const moreSubjects =
                                group.items.length - subjects.length;
                              return (
                                <li key={group.className}>
                                  <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                                    {group.className}
                                    <span className="ml-1.5 font-normal text-slate-500">
                                      · {group.items.length} matière
                                      {group.items.length > 1 ? "s" : ""}
                                    </span>
                                  </p>
                                  <ul className="space-y-1">
                                    {subjects.map((a) => (
                                      <li
                                        key={a.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm dark:bg-slate-800/60"
                                      >
                                        <span className="text-slate-700 dark:text-slate-300">
                                          {a.matieres?.name ?? "—"}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                                          onClick={() => setPendingRemove(a)}
                                        >
                                          Retirer
                                        </Button>
                                      </li>
                                    ))}
                                  </ul>
                                  {group.items.length > 3 ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="mt-1 text-brand-700 dark:text-brand-300"
                                      onClick={() =>
                                        setExpandedAssignments((prev) => ({
                                          ...prev,
                                          [groupKey]: !prev[groupKey],
                                        }))
                                      }
                                    >
                                      {subjectsOpen
                                        ? "Réduire"
                                        : `Voir les ${moreSubjects} autres matières`}
                                    </Button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          {hasMore ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="mt-2 text-brand-700 dark:text-brand-300"
                              onClick={() =>
                                setExpandedAssignments((prev) => ({
                                  ...prev,
                                  [t.id]: !prev[t.id],
                                }))
                              }
                            >
                              {expanded
                                ? "Réduire les classes"
                                : `Voir plus de classes (${hiddenCount})`}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
