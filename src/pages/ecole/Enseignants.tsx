import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, KeyRound, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile, Subject } from "@/lib/types";
import { compareClassesByProgression, sortClassesByProgression } from "@/lib/classCatalog";
import { cn, fromAuthEmail, fullName } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import {
  fetchAllTeachers,
  fetchTeachersPage,
  type AdminUserRow,
} from "@/lib/scaleApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageParams } from "@/hooks/usePageParams";
import { useRowSelection } from "@/hooks/useRowSelection";
import { credentialsToCsv, downloadTextFile } from "@/lib/studentCsv";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Modal } from "@/components/Modal";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import { SearchField } from "@/components/SearchField";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { RowMenu } from "@/components/RowMenu";
import { BulkBar } from "@/components/BulkBar";
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
  const { page, pageSize, setPage, setPageSize } = usePageParams();
  const search = searchParams.get("q") ?? "";
  const setSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value.trimStart()) next.set("q", value);
        else next.delete("q");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };
  // name of the teacher being assigned when that teacher is not on the page on screen
  const [assignName, setAssignName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedAssignments, setExpandedAssignments] = useState<
    Record<string, boolean>
  >({});
  const [pendingRemove, setPendingRemove] = useState<AssignmentRow | null>(
    null,
  );
  const openAssign = (preselectTeacherId: string, name = "") => {
    setAssignName(name);
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

  // One page of teachers at a time, searched and counted by the database.
  const debouncedSearch = useDebouncedValue(search, 300);
  const {
    data: teachersPage,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["enseignants", schoolId, "v2", debouncedSearch, page, pageSize],
    placeholderData: keepPreviousData,
    enabled: !!schoolId,
    queryFn: () =>
      fetchTeachersPage(schoolId!, {
        search: debouncedSearch,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });
  const teachers = useMemo(() => teachersPage?.rows ?? [], [teachersPage]);
  const teachersTotal = teachersPage?.total ?? 0;

  // a page number from an old link that no longer exists → last page
  useEffect(() => {
    if (!teachersPage || isFetching) return;
    const last = Math.max(1, Math.ceil(teachersPage.total / pageSize));
    if (page > last) setPage(last);
  }, [teachersPage, isFetching, page, pageSize, setPage]);

  const selection = useRowSelection<AdminUserRow>();
  const pageFullySelected =
    teachers.length > 0 && teachers.every((t) => selection.ids.has(t.id));
  const canSelectAllResults = pageFullySelected && teachersTotal > selection.count;

  const selectAllResults = async () => {
    if (!schoolId) return;
    try {
      const all = await fetchAllTeachers(schoolId, { search: debouncedSearch });
      selection.setMany(all, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sélection impossible");
    }
  };

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

  // CSV of the temporary passwords of the selected teachers (read-only: the hints are
  // fetched for the selection, they are not on screen for teachers of other pages)
  const exportSelectionCredentials = async () => {
    const chosen = selection.rows;
    if (chosen.length === 0) return;
    try {
      const hints = new Map<string, TeacherCredential>();
      for (let i = 0; i < chosen.length; i += 100) {
        const ids = chosen.slice(i, i + 100).map((t) => t.id);
        const { data, error } = await supabase
          .from("identifiants_temporaires")
          .select("user_id, username, temp_password_hint, used")
          .in("user_id", ids);
        if (error) throw error;
        for (const row of data ?? []) {
          hints.set(row.user_id as string, {
            username: row.username as string,
            tempPassword: (row.temp_password_hint as string | null) ?? null,
            used: Boolean(row.used),
          });
        }
      }
      const rows = chosen
        .map((t) => {
          const cred = hints.get(t.id);
          if (!cred?.tempPassword || cred.used) return null;
          return {
            firstName: t.first_name,
            lastName: t.last_name,
            className: "Enseignant",
            username: cred.username,
            tempPassword: cred.tempPassword,
          };
        })
        .filter(Boolean) as {
        firstName: string;
        lastName: string;
        className: string;
        username: string;
        tempPassword: string;
      }[];
      if (rows.length === 0) {
        toast.message("Aucun mot de passe temporaire à télécharger");
        return;
      }
      downloadTextFile(
        `identifiants-enseignants-${new Date().toISOString().slice(0, 10)}.csv`,
        credentialsToCsv(rows),
      );
      toast.success(`${rows.length} identifiant(s) exporté(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export impossible");
    }
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

  // Assignments of the teachers on screen only, and only for this school's classes.
  const { data: assignments = [] } = useQuery({
    queryKey: ["affectations", schoolId, "v5", teacherIds.join(",")],
    enabled: !!schoolId && teacherIds.length > 0 && classesRaw.length > 0,
    queryFn: async () => {
      const nameById = new Map(classesRaw.map((c) => [c.id, c.name]));
      const rows: AssignmentRow[] = [];
      const chunkSize = 10;
      const chunks: string[][] = [];
      for (let i = 0; i < teacherIds.length; i += chunkSize) {
        chunks.push(teacherIds.slice(i, i + chunkSize));
      }
      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("affectations_enseignement")
            .select("id, teacher_id, class_section_id, subject_id, matieres(name)")
            .in("teacher_id", chunk),
        ),
      );
      for (const { data, error } of results) {
        if (error) throw error;
        for (const a of data ?? []) {
          const classId = a.class_section_id as string;
          // a teacher can also teach in another school: only this school's classes
          if (!nameById.has(classId)) continue;
          rows.push({
            id: a.id as string,
            teacher_id: a.teacher_id as string,
            class_section_id: classId,
            subject_id: a.subject_id as string,
            classes: { name: nameById.get(classId) ?? "—" },
            matieres: (a as unknown as { matieres: { name: string } | null }).matieres,
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
    const createdName = fullName(firstName.trim(), lastName.trim());
    closeCreate();
    if (res.userId) openAssign(res.userId, createdName);

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

  const teacherMenu = (t: AdminUserRow) => [
    {
      label: "Nouveau mot de passe",
      icon: <KeyRound className="h-4 w-4" />,
      onSelect: () => void runCredentialAction(t, "reset_password"),
    },
    {
      label: "Lien oublié",
      icon: <Link2 className="h-4 w-4" />,
      onSelect: () => void runCredentialAction(t, "recovery_link"),
    },
  ];

  const toggleOpen = (id: string) =>
    setExpandedAssignments((prev) => ({ ...prev, [id]: !prev[id] }));

  /** "3 classes · 7 matières" button that opens the assignment list of a teacher. */
  const assignmentsSummary = (t: AdminUserRow) => {
    const list = assignmentsByTeacher.get(t.id) ?? [];
    if (list.length === 0) {
      return <span className="text-sm text-slate-400">Pas encore affecté</span>;
    }
    const groups = groupAssignmentsByClass(list);
    const open = !!expandedAssignments[t.id];
    return (
      <button
        type="button"
        onClick={() => toggleOpen(t.id)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-left text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/25"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {groups.length} classe{groups.length > 1 ? "s" : ""} · {list.length} matière
        {list.length > 1 ? "s" : ""}
      </button>
    );
  };

  /** Full list of a teacher's classes and subjects, with « Retirer » (asks the admin password). */
  const assignmentsDetail = (t: AdminUserRow) => {
    if (!expandedAssignments[t.id]) return null;
    const classGroups = groupAssignmentsByClass(assignmentsByTeacher.get(t.id) ?? []);
    if (classGroups.length === 0) return null;
    return (
      <ul className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {classGroups.map((group) => {
          const groupKey = `${t.id}:${group.className}`;
          const subjectsOpen =
            !!expandedAssignments[groupKey] || group.items.length <= 3;
          const subjects = subjectsOpen ? group.items : group.items.slice(0, 3);
          const moreSubjects = group.items.length - subjects.length;
          return (
            <li key={group.className}>
              <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                {group.className}
                <span className="ml-1.5 font-normal text-slate-500">
                  · {group.items.length} matière{group.items.length > 1 ? "s" : ""}
                </span>
              </p>
              <ul className="space-y-1">
                {subjects.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm dark:bg-slate-800/60"
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
                  onClick={() => toggleOpen(groupKey)}
                >
                  {subjectsOpen ? "Réduire" : `Voir les ${moreSubjects} autres matières`}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const teacherColumns: DataTableColumn<AdminUserRow>[] = [
    {
      key: "enseignant",
      header: "Enseignant",
      cell: (t) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {fullName(t.first_name, t.last_name)}
          </p>
          {t.phone ? <p className="text-xs text-slate-500">{t.phone}</p> : null}
        </div>
      ),
    },
    {
      key: "identifiant",
      header: "Identifiant",
      hideBelowLg: true,
      cell: (t) => {
        const cred = credentialFor(t);
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge>{cred.username}</Badge>
            {cred.tempPassword && !cred.used ? (
              <span title="Mot de passe temporaire">
                <Badge tone="warning">{cred.tempPassword}</Badge>
              </span>
            ) : null}
          </div>
        );
      },
    },
    { key: "affectations", header: "Affectations", cell: assignmentsSummary },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-48 text-right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openAssign(t.id, fullName(t.first_name, t.last_name))}
          >
            Affecter
          </Button>
          <RowMenu
            label={`Actions pour ${fullName(t.first_name, t.last_name)}`}
            busy={busyId === t.id}
            items={teacherMenu(t)}
          />
        </div>
      ),
    },
  ];

  const teacherMobileRow = (t: AdminUserRow) => {
    const cred = credentialFor(t);
    return (
      <div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">
              {fullName(t.first_name, t.last_name)}
            </p>
            <p className="text-xs text-slate-500">
              {cred.username}
              {t.phone ? ` · ${t.phone}` : ""}
            </p>
          </div>
          <RowMenu
            label={`Actions pour ${fullName(t.first_name, t.last_name)}`}
            busy={busyId === t.id}
            items={teacherMenu(t)}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {assignmentsSummary(t)}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openAssign(t.id, fullName(t.first_name, t.last_name))}
          >
            Affecter
          </Button>
        </div>
      </div>
    );
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
                    teachers.find((t) => t.id === teacherId)?.first_name,
                    teachers.find((t) => t.id === teacherId)?.last_name,
                  ) ||
                    assignName ||
                    "Enseignant sélectionné"}
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
      ) : teachersTotal === 0 && !debouncedSearch.trim() ? (
        <EmptyState message="Aucun enseignant. Créez le premier compte." />
      ) : (
        <div className={cn("space-y-4", selection.count > 0 && "pb-24")}>
          <Card className="p-4">
            <Label htmlFor="search-enseignants">Rechercher</Label>
            <SearchField
              id="search-enseignants"
              className="max-w-xl"
              value={search}
              onChange={setSearch}
              placeholder="Nom, prénom, identifiant…"
            />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {teachersTotal} enseignant{teachersTotal !== 1 ? "s" : ""}
                </span>
                {debouncedSearch.trim() ? ` · « ${debouncedSearch.trim()} »` : ""}
              </p>
            </div>
            {teachers.length === 0 ? (
              <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-700">
                <EmptyState
                  message={`Aucun enseignant ne correspond à « ${debouncedSearch.trim()} ».`}
                />
                <div className="flex justify-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
                    Effacer la recherche
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-100 dark:border-slate-700">
                <DataTable
                  rows={teachers}
                  columns={teacherColumns}
                  mobileRow={teacherMobileRow}
                  selectedIds={selection.ids}
                  onToggle={selection.toggle}
                  onTogglePage={selection.setMany}
                  rowLabel={(t) => `Sélectionner ${fullName(t.first_name, t.last_name)}`}
                  dimmed={isFetching}
                  detail={assignmentsDetail}
                />
              </div>
            )}
            {teachersTotal > 0 ? (
              <Pagination
                total={teachersTotal}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="enseignant"
                busy={isFetching}
              />
            ) : null}
          </Card>
        </div>
      )}

      <BulkBar count={selection.count} noun="enseignant" onClear={selection.clear}>
        {canSelectAllResults ? (
          <button
            type="button"
            onClick={() => void selectAllResults()}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-200 underline underline-offset-2 hover:text-white"
          >
            Sélectionner les {teachersTotal} résultats
          </button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void exportSelectionCredentials()}
        >
          <Download className="mr-1 h-4 w-4" />
          Identifiants (CSV)
        </Button>
      </BulkBar>
    </div>
  );
}
