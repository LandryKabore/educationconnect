import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile, Subject } from "@/lib/types";
import { compareClassesByProgression, sortClassesByProgression } from "@/lib/classCatalog";
import { fromAuthEmail, fullName, matchesSearch } from "@/lib/utils";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
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

export default function Enseignants() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [showAssign, setShowAssign] = useState(
    () => searchParams.get("assign") === "1",
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (searchParams.get("assign") === "1") {
      setShowAssign(true);
      setShowForm(false);
    }
  }, [searchParams]);

  const openAssign = (preselectTeacherId?: string) => {
    setShowAssign(true);
    setShowForm(false);
    if (preselectTeacherId) {
      setTeacherId(preselectTeacherId);
      setClassId("");
      setSubjectId("");
    }
    const next = new URLSearchParams(searchParams);
    next.set("assign", "1");
    setSearchParams(next, { replace: true });
  };

  const closeAssign = () => {
    setShowAssign(false);
    const next = new URLSearchParams(searchParams);
    next.delete("assign");
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

  const { data: classSubjects = [], isFetching: loadingClassSubjects } =
    useQuery({
      queryKey: ["programme-classe-subjects", classId],
      enabled: !!classId,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("programme_classe")
          .select("subject_id, matieres(*)")
          .eq("class_section_id", classId);
        if (error) throw error;
        const map = new Map<string, Subject>();
        for (const row of data ?? []) {
          const s = (row as unknown as { matieres: Subject | null }).matieres;
          if (s) map.set(s.id, s);
        }
        return [...map.values()].sort((a, b) =>
          a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
        );
      },
    });

  const { data: assignments = [] } = useQuery({
    queryKey: ["affectations", schoolId],
    enabled: !!schoolId && classes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "id, teacher_id, class_section_id, subject_id, classes(name), matieres(name)",
        )
        .in(
          "class_section_id",
          classes.map((c) => c.id),
        );
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
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
    else openAssign();

    void qc.invalidateQueries({ queryKey: ["enseignants", schoolId] });
    void qc.invalidateQueries({ queryKey: ["identifiants-enseignants", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    setCreating(false);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !classId || !subjectId) {
      toast.error("Choisissez enseignant, classe et matière");
      return;
    }
    setAssigning(true);
    const { error } = await supabase.from("affectations_enseignement").insert({
      teacher_id: teacherId,
      class_section_id: classId,
      subject_id: subjectId,
    });
    if (error) {
      setAssigning(false);
      toast.error(
        error.message.includes("duplicate")
          ? "Affectation déjà existante"
          : "Erreur",
      );
      return;
    }

    setAssigning(false);
    toast.success("Affectation enregistrée");
    setSubjectId("");
    void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase
      .from("affectations_enseignement")
      .delete()
      .eq("id", id);
    if (error) toast.error("Suppression impossible");
    else {
      toast.success("Affectation retirée");
      void qc.invalidateQueries({ queryKey: ["affectations", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    }
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Enseignants"
        subtitle="Comptes, identifiants et affectations par enseignant"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={showAssign ? "primary" : "outline"}
              onClick={() => (showAssign ? closeAssign() : openAssign())}
            >
              {showAssign ? "Fermer affectation" : "Affecter"}
            </Button>
            <Button
              type="button"
              variant={showForm ? "outline" : "primary"}
              onClick={() => (showForm ? closeCreate() : openCreate())}
            >
              {showForm ? "Fermer" : "Nouvel enseignant"}
            </Button>
          </div>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <h3 className="mb-4 font-semibold">Nouvel enseignant</h3>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Prénom</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
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
              <Button type="button" variant="ghost" onClick={closeCreate}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {showAssign ? (
        <Card className="mb-6 max-w-lg">
          <h3 className="mb-4 font-semibold">Affecter un enseignant</h3>
          <form onSubmit={(e) => void handleAssign(e)} className="space-y-4">
            <div>
              <Label>Enseignant</Label>
              <Select
                value={teacherId}
                onChange={(e) => {
                  setTeacherId(e.target.value);
                  setClassId("");
                  setSubjectId("");
                }}
                required
              >
                <option value="">Choisir…</option>
                {sortedTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t.first_name, t.last_name)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Classe</Label>
              <Select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSubjectId("");
                }}
                required
                disabled={!teacherId}
              >
                <option value="">
                  {teacherId
                    ? "Choisir…"
                    : "Choisissez d’abord un enseignant"}
                </option>
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
                disabled={!classId}
              >
                <option value="">
                  {!classId
                    ? "Choisissez d’abord une classe"
                    : loadingClassSubjects
                      ? "Chargement…"
                      : classSubjects.length === 0
                        ? "Aucune matière au programme"
                        : "Choisir…"}
                </option>
                {classSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {classId &&
              !loadingClassSubjects &&
              classSubjects.length === 0 ? (
                <p className="mt-1.5 text-xs text-amber-700">
                  Définissez d’abord le programme de cette classe (page
                  Programmes).
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={assigning || !teacherId || !classId || !subjectId}
            >
              {assigning ? "Enregistrement…" : "Enregistrer l’affectation"}
            </Button>
          </form>
        </Card>
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
                          {cred.tempPassword ? (
                            <>
                              <span className="text-slate-500">Mot de passe</span>
                              <Badge tone="warning">{cred.tempPassword}</Badge>
                              {cred.used ? (
                                <span className="text-xs text-slate-400">
                                  (déjà utilisé)
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Mot de passe non disponible
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openAssign(t.id)}
                      >
                        Affecter
                      </Button>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3">
                      {teacherAssignments.length === 0 ? (
                        <p className="text-sm text-slate-400">
                          Pas encore affecté
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {teacherAssignments.map((a) => (
                            <li
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            >
                              <span className="text-slate-700">
                                {a.classes?.name ?? "—"} ·{" "}
                                {a.matieres?.name ?? "—"}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void removeAssignment(a.id)}
                              >
                                Retirer
                              </Button>
                            </li>
                          ))}
                        </ul>
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
