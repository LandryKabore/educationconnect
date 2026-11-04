import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Download, KeyRound, Link2, LogOut, Undo2, Upload, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  fetchAllStudents,
  fetchClassStudentCounts,
  fetchStudentsPage,
  fetchStudentsWithoutClass,
  exitReasonLabel,
  type StudentPageRow,
} from "@/lib/scaleApi";
import { ReintegrerModal, SortieEleveModal } from "@/components/SortieEleve";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageParams } from "@/hooks/usePageParams";
import { useRowSelection } from "@/hooks/useRowSelection";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { cn, fromAuthEmail, fullName } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import {
  credentialsToCsv,
  downloadBlob,
  downloadTextFile,
  parseStudentImportFile,
  studentCsvTemplate,
  studentXlsxTemplateBlob,
  type StudentCsvRow,
} from "@/lib/studentCsv";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Modal } from "@/components/Modal";
import { ClassColorBadge } from "@/components/ClassColor";
import { ClassFilter } from "@/components/ClassFilter";
import { SearchField } from "@/components/SearchField";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { Pagination } from "@/components/Pagination";
import { RowMenu } from "@/components/RowMenu";
import { BulkBar } from "@/components/BulkBar";
import {
  Badge,
  Button,
  Card,
  DateInputFr,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

interface CreateResult {
  username: string;
  tempPassword: string;
  /** family-first school: no login was created, the parent is the only account */
  familyManaged?: boolean;
}

interface ImportCredential {
  firstName: string;
  lastName: string;
  className: string;
  username: string;
  tempPassword: string;
  familyManaged?: boolean;
}

interface ImportParent {
  childName: string;
  firstName: string;
  lastName: string;
  phone: string;
  username: string;
  tempPassword: string;
  existing: boolean;
}

interface ImportWarning {
  line: number | null;
  firstName: string;
  lastName: string;
  message: string;
}

interface StudentCredential {
  username: string;
  tempPassword: string | null;
  used: boolean;
}

type StudentRow = StudentPageRow;

function accountStatus(s: StudentRow, cred: StudentCredential) {
  if (s.exit) {
    return {
      label: `Sorti(e) le ${format(new Date(s.exit.leftAt), "d MMM yyyy", { locale: fr })}`,
      tone: "warning" as const,
      detail: `${exitReasonLabel(s.exit.reason)}${s.exit.className ? ` · ${s.exit.className}` : ""}`,
    };
  }
  if (s.family_managed) {
    return {
      label: "Compte famille",
      tone: "info" as const,
      detail: "Pas de connexion élève : le parent suit son enfant",
    };
  }
  if (!s.must_change_password && (cred.used || s.last_login_at)) {
    return {
      label: "Mot de passe modifié",
      tone: "success" as const,
      detail: s.last_login_at
        ? `Dernière connexion : ${format(new Date(s.last_login_at), "d MMM yyyy à HH:mm", { locale: fr })}`
        : null,
    };
  }
  if (s.last_login_at) {
    return {
      label: "Connecté · à changer le mot de passe",
      tone: "warning" as const,
      detail: `Dernière connexion : ${format(new Date(s.last_login_at), "d MMM yyyy à HH:mm", { locale: fr })}`,
    };
  }
  return {
    label: "Jamais connecté",
    tone: "default" as const,
    detail: cred.tempPassword
      ? "Identifiants temporaires encore valides"
      : "Réinitialisez le mot de passe si besoin",
  };
}

export default function Eleves() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageSize, setPage, setPageSize } = usePageParams();

  // "" = tous les élèves, "__none__" = sans classe, sinon l'id d'une classe
  const selectedClassId = searchParams.get("classe") ?? "";
  const search = searchParams.get("q") ?? "";

  const setSelectedClassId = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("classe", value);
        else next.delete("classe");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const setSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const trimmed = value.trimStart();
        if (trimmed) next.set("q", value);
        else next.delete("q");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const clearFilters = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("q");
        next.delete("classe");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };


  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [matricule, setMatricule] = useState("");
  const [address, setAddress] = useState("");
  const [classId, setClassId] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const [previewRows, setPreviewRows] = useState<StudentCsvRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [defaultClassId, setDefaultClassId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importCreds, setImportCreds] = useState<ImportCredential[]>([]);
  const [importParents, setImportParents] = useState<ImportParent[]>([]);
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [importFailed, setImportFailed] = useState<
    { line: number | null; firstName: string; lastName: string; error: string }[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exitTarget, setExitTarget] = useState<StudentRow | null>(null);
  const [reinstateTarget, setReinstateTarget] = useState<StudentRow | null>(null);
  const [bulkClassId, setBulkClassId] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);

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

  // One page at a time (all students by default), searched and counted by the database.
  const debouncedSearch = useDebouncedValue(search, 300);
  const {
    data: studentsPage,
    isLoading: studentsLoading,
    isFetching: studentsFetching,
  } = useQuery({
    queryKey: ["eleves", schoolId, "v6", selectedClassId, debouncedSearch, page, pageSize],
    // keep the list on screen while typing a search or changing page
    placeholderData: keepPreviousData,
    enabled: !!schoolId,
    queryFn: () =>
      fetchStudentsPage(schoolId!, {
        classId: selectedClassId,
        search: debouncedSearch,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });
  const filteredStudents = useMemo(
    () => (studentsPage?.rows ?? []) as StudentRow[],
    [studentsPage],
  );
  const filteredTotal = studentsPage?.total ?? 0;

  // a page number from an old link that no longer exists → last page
  useEffect(() => {
    if (!studentsPage || studentsFetching) return;
    const last = Math.max(1, Math.ceil(studentsPage.total / pageSize));
    if (page > last) setPage(last);
  }, [studentsPage, studentsFetching, page, pageSize, setPage]);

  // Class dropdown numbers and the "sans classe" count come from the database,
  // so they stay exact above 1,000 students.
  const { data: classCounts = {}, isLoading: countsLoading } = useQuery({
    queryKey: ["eleves-class-counts", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchClassStudentCounts(schoolId!),
  });
  const { data: withoutClass, isLoading: withoutLoading } = useQuery({
    queryKey: ["eleves-sans-classe", schoolId, "v5"],
    enabled: !!schoolId,
    queryFn: () => fetchStudentsWithoutClass(schoolId!, 0),
  });
  const sansClasseCount = withoutClass?.count ?? 0;
  const totalStudents =
    Object.values(classCounts).reduce((n, v) => n + v, 0) + sansClasseCount;
  const isLoading = studentsLoading;
  const classesLoadingGuard = countsLoading || withoutLoading;

  const credentialFor = (s: StudentRow): StudentCredential => {
    const stored = s.cred;
    if (stored)
      return {
        username: stored.username ?? "—",
        tempPassword: stored.tempPassword ?? null,
        used: Boolean(stored.used),
      };
    return {
      username: fromAuthEmail(s.email) || "—",
      tempPassword: null,
      used: !s.must_change_password,
    };
  };

  const selectedClassLabel = useMemo(() => {
    if (selectedClassId === "__none__") return "Sans classe";
    if (selectedClassId === "__former__") return "Anciens élèves";
    return classes.find((c) => c.id === selectedClassId)?.name ?? "";
  }, [selectedClassId, classes]);

  const selection = useRowSelection<StudentRow>();
  // Only students without a class can be assigned (a second class would double-enrol them).
  const selectedWithClass = selection.rows.filter((s) => s.classSectionId).length;
  const canBulkAssign = selection.count > 0 && selectedWithClass === 0;
  const pageFullySelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selection.ids.has(s.id));
  const canSelectAllResults = pageFullySelected && filteredTotal > selection.count;

  const selectAllResults = async () => {
    if (!schoolId) return;
    try {
      // every matching student, including those on other pages
      const all = await fetchAllStudents(schoolId, {
        classId: selectedClassId,
        search: debouncedSearch,
      });
      selection.setMany(all as StudentRow[], true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sélection impossible");
    }
  };

  const handleBulkAssignClass = async () => {
    if (selection.count === 0) {
      toast.error("Sélectionnez au moins un élève");
      return;
    }
    if (!canBulkAssign) {
      toast.error(
        "Seuls les élèves sans classe peuvent être affectés — décochez ceux qui ont déjà une classe",
      );
      return;
    }
    if (!bulkClassId) {
      toast.error("Choisissez une classe");
      return;
    }
    const target = classes.find((c) => c.id === bulkClassId);
    if (!target?.academic_year_id) {
      toast.error("Cette classe n’a pas d’année scolaire");
      return;
    }

    setBulkAssigning(true);
    try {
      const payload = selection.rows.map((s) => ({
        student_id: s.id,
        class_section_id: bulkClassId,
        academic_year_id: target.academic_year_id,
        status: "active",
      }));
      const { error } = await supabase.from("inscriptions").insert(payload);
      if (error) throw error;
      toast.success(
        `${payload.length} élève${payload.length > 1 ? "s" : ""} affecté${payload.length > 1 ? "s" : ""} en ${target.name}`,
      );
      selection.clear();
      setBulkClassId("");
      invalidateStudentQueries();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Affectation impossible",
      );
    } finally {
      setBulkAssigning(false);
    }
  };

  const invalidateStudentQueries = () => {
    void qc.invalidateQueries({ queryKey: ["eleves", schoolId] });
    void qc.invalidateQueries({ queryKey: ["eleves-class-counts", schoolId] });
    void qc.invalidateQueries({ queryKey: ["identifiants-eleves", schoolId] });
    void qc.invalidateQueries({ queryKey: ["eleves-sans-classe", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["ecole-stats", schoolId] });
    void qc.invalidateQueries({ queryKey: ["departs", schoolId] });
    void qc.invalidateQueries({ queryKey: ["family-overview", schoolId] });
  };

  const exportCredentials = (source: StudentRow[], slug: string) => {
    const rows = source
      .map((s) => {
        const cred = credentialFor(s);
        if (!cred.tempPassword || cred.used) return null;
        return {
          firstName: s.first_name,
          lastName: s.last_name,
          className: s.className ?? "",
          username: cred.username,
          tempPassword: cred.tempPassword,
        };
      })
      .filter(Boolean) as ImportCredential[];
    if (rows.length === 0) {
      toast.message("Aucun mot de passe temporaire à télécharger pour cette sélection");
      return;
    }
    downloadTextFile(
      `identifiants-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      credentialsToCsv(rows),
    );
    toast.success(`${rows.length} identifiant(s) exporté(s)`);
  };

  const downloadAllCredentials = async () => {
    if (!schoolId) return;
    // Export every student of the filter (not only the page on screen).
    let source: StudentRow[];
    try {
      source = await fetchAllStudents(schoolId, {
        classId: selectedClassId,
        search: debouncedSearch,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export impossible");
      return;
    }
    exportCredentials(
      source,
      selectedClassLabel
        ? selectedClassLabel.replace(/\s+/g, "-").toLowerCase()
        : "eleves",
    );
  };

  const runCredentialAction = async (
    student: StudentRow,
    action: "reset_password" | "recovery_link",
  ) => {
    if (!schoolId) return;
    setBusyId(student.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "gerer-identifiant",
        {
          body: {
            action,
            userId: student.id,
            schoolId,
            redirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/premiere-connexion`
                : undefined,
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
        invalidateStudentQueries();
      } else if (action === "recovery_link" && res.recoveryLink) {
        const copied = await copyToClipboard(res.recoveryLink);
        if (copied) {
          toast.success("Lien de réinitialisation copié", {
            description: "Envoyez-le à l’élève ou au parent.",
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


  const listState = {
    elevesList: searchParams.toString()
      ? `/eleves?${searchParams.toString()}`
      : "/eleves",
  };

  const studentMenu = (s: StudentRow) => {
    const profileItem = {
      label: "Voir le profil",
      icon: <User className="h-4 w-4" />,
      onSelect: () => navigate(`/eleves/${s.id}`, { state: listState }),
    };
    // former pupil: profile + return to school
    if (s.exit) {
      return [
        profileItem,
        {
          label: "Réintégrer",
          icon: <Undo2 className="h-4 w-4" />,
          onSelect: () => setReinstateTarget(s),
        },
      ];
    }
    // family-first pupil: no password to reset (the parent is the only login)
    if (s.family_managed) {
      return [
        profileItem,
        {
          label: "Sortie de l'élève",
          icon: <LogOut className="h-4 w-4" />,
          onSelect: () => setExitTarget(s),
        },
      ];
    }
    return [
      profileItem,
      {
        label: "Nouveau mot de passe",
        icon: <KeyRound className="h-4 w-4" />,
        onSelect: () => void runCredentialAction(s, "reset_password"),
      },
      {
        label: "Lien oublié",
        icon: <Link2 className="h-4 w-4" />,
        onSelect: () => void runCredentialAction(s, "recovery_link"),
      },
      {
        label: "Sortie de l'élève",
        icon: <LogOut className="h-4 w-4" />,
        onSelect: () => setExitTarget(s),
      },
    ];
  };

  const studentColumns: DataTableColumn<StudentRow>[] = [
    {
      key: "eleve",
      header: "Élève",
      cell: (s) => (
        <Link
          to={`/eleves/${s.id}`}
          state={listState}
          className="flex min-w-0 items-center gap-3 rounded-lg outline-none ring-brand-500 focus-visible:ring-2"
        >
          <ProfileAvatar
            userId={s.id}
            avatarUrl={s.avatar_url}
            name={fullName(s.first_name, s.last_name)}
            size="sm"
          />
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900 hover:text-brand-800">
              {fullName(s.first_name, s.last_name)}
            </span>
            {s.phone ? (
              <span className="block text-xs text-slate-500">{s.phone}</span>
            ) : null}
          </span>
        </Link>
      ),
    },
    {
      key: "classe",
      header: "Classe",
      cell: (s) =>
        s.exit ? (
          <span className="text-sm text-slate-600">{s.exit.className ?? "—"}</span>
        ) : s.className ? (
          <ClassColorBadge id={s.classSectionId} name={s.className} />
        ) : (
          <span className="text-xs font-medium text-amber-700">Sans classe</span>
        ),
    },
    {
      key: "identifiant",
      header: "Identifiant",
      hideBelowLg: true,
      cell: (s) => {
        if (s.family_managed || s.exit) return <span className="text-xs text-slate-400">—</span>;
        const cred = credentialFor(s);
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
    {
      key: "compte",
      header: "Compte",
      cell: (s) => {
        const status = accountStatus(s, credentialFor(s));
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            {status.detail ? (
              <span className="hidden text-xs text-slate-400 xl:block">
                {status.detail}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-12 text-right",
      cell: (s) => (
        <RowMenu
          label={`Actions pour ${fullName(s.first_name, s.last_name)}`}
          busy={busyId === s.id}
          items={studentMenu(s)}
        />
      ),
    },
  ];

  const studentMobileRow = (s: StudentRow) => {
    const cred = credentialFor(s);
    const status = accountStatus(s, cred);
    return (
      <div className="flex items-start gap-2">
        <Link
          to={`/eleves/${s.id}`}
          state={listState}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none ring-brand-500 focus-visible:ring-2"
        >
          <ProfileAvatar
            userId={s.id}
            avatarUrl={s.avatar_url}
            name={fullName(s.first_name, s.last_name)}
            size="sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">
              {fullName(s.first_name, s.last_name)}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {s.className ? (
                <ClassColorBadge id={s.classSectionId} name={s.className} />
              ) : (
                <span className="text-xs font-medium text-amber-700">Sans classe</span>
              )}
              <Badge tone={status.tone}>{status.label}</Badge>
            </span>
            {s.family_managed || s.exit ? null : (
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                {cred.username}
                {cred.tempPassword && !cred.used ? (
                  <Badge tone="warning">{cred.tempPassword}</Badge>
                ) : null}
              </span>
            )}
          </span>
        </Link>
        <RowMenu
          label={`Actions pour ${fullName(s.first_name, s.last_name)}`}
          busy={busyId === s.id}
          items={studentMenu(s)}
        />
      </div>
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (!classId) {
      toast.error("Choisissez une classe pour inscrire l’élève");
      return;
    }
    const selected = classes.find((c) => c.id === classId);
    if (!selected?.academic_year_id) {
      toast.error("Classe sans année scolaire — créez d’abord une année");
      return;
    }

    setCreating(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
      body: {
        role: "student",
        schoolId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        classId,
        academicYearId: selected.academic_year_id,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        phone: phone.trim() || null,
        matricule: matricule.trim() || null,
        address: address.trim() || null,
      },
    });

    if (error) {
      toast.error("La création a échoué");
    } else {
      const res = data as { username?: string; tempPassword?: string; error?: string };
      if (res.error) {
        toast.error(res.error);
        setCreating(false);
        return;
      }
      const fam = (data as { familyManaged?: boolean }).familyManaged === true;
      setResult({
        username: res.username ?? "—",
        tempPassword: res.tempPassword ?? "—",
        familyManaged: fam,
      });
      toast.success("Élève créé et inscrit en classe");
      invalidateStudentQueries();
    }

    setCreating(false);
    setFirstName("");
    setLastName("");
    setDateOfBirth("");
    setGender("");
    setPhone("");
    setMatricule("");
    setAddress("");
    setClassId("");
  };

  const resetImportModal = () => {
    setShowImport(false);
    setPreviewRows([]);
    setParseErrors([]);
    setImportCreds([]);
    setImportParents([]);
    setImportWarnings([]);
    setImportFailed([]);
    setImportDone(0);
    setImportTotal(0);
    setDefaultClassId("");
  };

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    const parsed = await parseStudentImportFile(file);
    setParseErrors(parsed.errors);
    setPreviewRows(parsed.rows);
    setImportCreds([]);
    setImportParents([]);
    setImportWarnings([]);
    setImportFailed([]);
    setImportDone(0);
    setImportTotal(0);
    if (parsed.rows.length === 0 && parsed.errors.length) {
      toast.error(parsed.errors[0]);
    } else if (parsed.rows.length) {
      toast.success(`${parsed.rows.length} élève(s) détecté(s)`);
    }
  };

  const runImport = async () => {
    if (!schoolId || previewRows.length === 0) return;

    const missingClass = previewRows.some((r) => !r.className) && !defaultClassId;
    if (missingClass) {
      toast.error(
        "Certaines lignes n’ont pas de classe — choisissez une classe par défaut ou ajoutez la colonne « classe ».",
      );
      return;
    }

    const total = previewRows.length;
    const batchSize = 5;
    setImporting(true);
    setImportDone(0);
    setImportTotal(total);
    setImportCreds([]);
    setImportParents([]);
    setImportWarnings([]);
    setImportFailed([]);

    const created: ImportCredential[] = [];
    const createdParents: ImportParent[] = [];
    const warnings: ImportWarning[] = [];
    const failed: typeof importFailed = [];

    for (let i = 0; i < previewRows.length; i += batchSize) {
      const batch = previewRows.slice(i, i + batchSize);
      const { data, error } = await supabase.functions.invoke("importer-eleves", {
        body: {
          schoolId,
          defaultClassId: defaultClassId || null,
          students: batch.map((r) => ({
            line: r.line,
            firstName: r.firstName,
            lastName: r.lastName,
            className: r.className || undefined,
            phone: r.phone || null,
            gender: r.gender || null,
            dateOfBirth: r.dateOfBirth || null,
            matricule: r.matricule || null,
            parentFirstName: r.parentFirstName || null,
            parentLastName: r.parentLastName || null,
            parentPhone: r.parentPhone || null,
          })),
        },
      });

      if (error) {
        for (const r of batch) {
          failed.push({
            line: r.line,
            firstName: r.firstName,
            lastName: r.lastName,
            error: error.message || "Import impossible",
          });
        }
      } else {
        const res = data as {
          error?: string;
          created?: ImportCredential[];
          failed?: typeof importFailed;
          parents?: ImportParent[];
          warnings?: ImportWarning[];
        };
        if (res.error) {
          for (const r of batch) {
            failed.push({
              line: r.line,
              firstName: r.firstName,
              lastName: r.lastName,
              error: res.error,
            });
          }
        } else {
          created.push(...(res.created ?? []));
          failed.push(...(res.failed ?? []));
          createdParents.push(...(res.parents ?? []));
          warnings.push(...(res.warnings ?? []));
        }
      }

      setImportDone(Math.min(i + batch.length, total));
    }

    setImporting(false);
    setImportCreds(created);
    setImportParents(createdParents);
    setImportWarnings(warnings);
    setImportFailed(failed);

    const ok = created.length;
    const errCount = failed.length;
    if (ok > 0) {
      toast.success(`${ok} élève(s) importé(s)`);
      invalidateStudentQueries();
      void qc.invalidateQueries({ queryKey: ["parents", schoolId] });
    }
    if (errCount > 0) {
      toast.message(`${errCount} ligne(s) en erreur`);
    }
    if (ok === 0 && errCount === 0) {
      toast.error("Aucun élève importé");
    }
  };

  // import result: pupils with their own login vs "compte famille" pupils (no login), plus the parents
  const loginCreds = importCreds.filter((c) => !c.familyManaged);
  const familyCount = importCreds.length - loginCreds.length;
  const importCsvRows = [
    ...loginCreds,
    ...importParents
      .filter((p) => !p.existing && p.username)
      .map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        className: `Parent de ${p.childName}`,
        username: p.username,
        tempPassword: p.tempPassword,
      })),
  ];

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Élèves"
        subtitle="Comptes, identifiants, anciens élèves et import CSV / Excel"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPreviewRows([]);
                setParseErrors([]);
                setImportCreds([]);
                setImportFailed([]);
                setImportDone(0);
                setImportTotal(0);
                setShowImport(true);
                setShowForm(false);
              }}
            >
              <Upload className="mr-1 h-4 w-4" />
              Importer
            </Button>
            <Button
              onClick={() => {
                setShowForm(true);
                setShowImport(false);
                if (
                  selectedClassId &&
                  selectedClassId !== "__none__" &&
                  !classId
                ) {
                  setClassId(selectedClassId);
                }
              }}
            >
              Nouvel élève
            </Button>
          </div>
        }
      />

      {sansClasseCount > 0 ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div>
            <p className="font-semibold">
              {sansClasseCount} élève{sansClasseCount > 1 ? "s" : ""} sans classe
            </p>
            <p className="mt-0.5 text-amber-800">
              Filtrez sur « Sans classe », cochez les élèves, puis affectez-les en
              masse à une classe.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedClassId("__none__");
              selection.clear();
              setBulkClassId("");
            }}
          >
            Voir sans classe
          </Button>
        </div>
      ) : null}

      {showImport ? (
        <Modal
          open={showImport}
          title="Import CSV / Excel"
          onClose={resetImportModal}
          closeDisabled={importing}
          size="xl"
        >
          {importCreds.length > 0 && !importing ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-brand-900">
                    Import terminé — {importCreds.length} élève(s) importé(s)
                    {importParents.length > 0
                      ? ` · ${importParents.filter((p) => !p.existing).length} parent(s) créé(s), ${importParents.filter((p) => p.existing).length} parent(s) déjà connu(s) relié(s)`
                      : ""}
                  </p>
                  {importCsvRows.length > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        downloadTextFile(
                          "identifiants-eleves-edufaso.csv",
                          credentialsToCsv(importCsvRows),
                        )
                      }
                    >
                      <Download className="mr-1 h-4 w-4" />
                      Télécharger les identifiants
                    </Button>
                  ) : null}
                </div>
                {familyCount > 0 ? (
                  <p className="mt-2 text-sm text-brand-900">
                    {familyCount} élève(s) en <strong>compte famille</strong> : pas de connexion élève, le parent
                    suit son enfant avec son propre compte.
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-brand-800">
                  Conservez ce fichier : les mots de passe temporaires ne
                  seront plus affichés ensuite.
                </p>
                <div className="mt-3 max-h-48 overflow-auto text-sm">
                  {importCreds.slice(0, 20).map((c, i) => (
                    <p key={`${c.username}-${i}`} className="py-0.5">
                      {fullName(c.firstName, c.lastName)} ·{" "}
                      {c.familyManaged ? (
                        <Badge tone="info">Compte famille</Badge>
                      ) : (
                        <>
                          <Badge>{c.username}</Badge> ·{" "}
                          <Badge tone="warning">{c.tempPassword}</Badge>
                        </>
                      )}
                    </p>
                  ))}
                  {importCreds.length > 20 ? (
                    <p className="text-xs text-slate-500">… voir le fichier CSV</p>
                  ) : null}
                </div>
              </div>

              {importWarnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <p className="font-medium text-amber-950">{importWarnings.length} point(s) à vérifier</p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-amber-900">
                    {importWarnings.map((w, i) => (
                      <li key={`${w.line}-w${i}`}>
                        {w.line ? `Ligne ${w.line} · ` : ""}
                        {fullName(w.firstName, w.lastName)} — {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {importFailed.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <p className="font-medium text-amber-950">
                    {importFailed.length} échec(s)
                  </p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-amber-900">
                    {importFailed.map((f, i) => (
                      <li key={`${f.line}-${i}`}>
                        {f.line ? `Ligne ${f.line} · ` : ""}
                        {fullName(f.firstName, f.lastName)} — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={resetImportModal}>
                  Fermer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportCreds([]);
                    setImportParents([]);
                    setImportWarnings([]);
                    setImportFailed([]);
                    setPreviewRows([]);
                    setParseErrors([]);
                    setImportDone(0);
                    setImportTotal(0);
                    fileRef.current?.click();
                  }}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Importer un autre fichier
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  void onFileSelected(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <>
          <p className="mt-1 text-sm text-slate-600">
            Importez votre fichier <code className="text-xs">.csv</code> ou{" "}
            <code className="text-xs">.xlsx</code> : colonne A = prénom, B =
            nom, C = classe (optionnel), D = téléphone (optionnel). Avec
            en-tête : <code className="text-xs">prenom</code>,{" "}
            <code className="text-xs">nom</code>,{" "}
            <code className="text-xs">classe</code>,{" "}
            <code className="text-xs">telephone</code>, et en plus (facultatif) :{" "}
            <code className="text-xs">sexe</code> (M/F),{" "}
            <code className="text-xs">date_naissance</code> (jj/mm/aaaa),{" "}
            <code className="text-xs">matricule</code>,{" "}
            <code className="text-xs">parent_prenom</code>,{" "}
            <code className="text-xs">parent_nom</code>,{" "}
            <code className="text-xs">parent_telephone</code>. Deux frères avec le même
            téléphone de parent partagent le même parent. Première feuille Excel. Max 200 élèves.
          </p>

          <div className="mt-4">
            <Button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Upload className="mr-1 h-4 w-4" />
              Choisir le fichier à importer
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                void onFileSelected(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-xs text-slate-500">
              Besoin d’un exemple de format ?{" "}
              <button
                type="button"
                className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
                onClick={() =>
                  downloadTextFile(
                    "modele-eleves-edufaso.csv",
                    studentCsvTemplate(),
                  )
                }
              >
                modèle CSV
              </button>
              {" · "}
              <button
                type="button"
                className="text-brand-700 underline underline-offset-2 hover:text-brand-800"
                onClick={() =>
                  downloadBlob(
                    "modele-eleves-edufaso.xlsx",
                    studentXlsxTemplateBlob(),
                  )
                }
              >
                modèle Excel
              </button>
            </p>
          </div>

          <div className="mt-4 max-w-md">
            <Label>Classe par défaut (si absente du CSV)</Label>
            <Select
              value={defaultClassId}
              onChange={(e) => setDefaultClassId(e.target.value)}
              disabled={importing}
            >
              <option value="">Aucune</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {parseErrors.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-amber-800">
              {parseErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}

          {previewRows.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">
                Aperçu ({previewRows.length} ligne(s))
              </p>
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Ligne</th>
                      <th className="px-3 py-2">Prénom</th>
                      <th className="px-3 py-2">Nom</th>
                      <th className="px-3 py-2">Classe</th>
                      <th className="px-3 py-2">Tél.</th>
                      <th className="px-3 py-2">Sexe</th>
                      <th className="px-3 py-2">Naissance</th>
                      <th className="px-3 py-2">Parent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 50).map((r) => (
                      <tr key={r.line} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-400">{r.line}</td>
                        <td className="px-3 py-1.5">{r.firstName}</td>
                        <td className="px-3 py-1.5">{r.lastName}</td>
                        <td className="px-3 py-1.5">
                          {r.className || (
                            <span className="text-amber-700">défaut</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{r.phone || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.gender || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {r.dateOfBirth ? r.dateOfBirth.split("-").reverse().join("/") : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {r.parentPhone
                            ? `${r.parentFirstName} ${r.parentLastName} · ${r.parentPhone}`.trim()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewRows.length > 50 ? (
                <p className="mt-1 text-xs text-slate-400">
                  … et {previewRows.length - 50} autres
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => void runImport()}
                    disabled={importing || classes.length === 0}
                  >
                    {importing
                      ? "Import en cours…"
                      : `Importer ${previewRows.length} élève(s)`}
                  </Button>
                </div>
                {importing && importTotal > 0 ? (
                  <div className="max-w-md space-y-1.5">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>
                        {importDone} / {importTotal} élève(s)
                      </span>
                      <span>
                        {Math.round((importDone / importTotal) * 100)}%
                      </span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={importTotal}
                      aria-valuenow={importDone}
                    >
                      <div
                        className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
                        style={{
                          width: `${Math.max(
                            (importDone / importTotal) * 100,
                            importDone === 0 ? 4 : 0,
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Merci de patienter — l’import continue…
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
            </>
          )}
        </Modal>
      ) : null}

      {showForm ? (
        <Modal
          open={showForm}
          title="Nouvel élève"
          onClose={() => setShowForm(false)}
          closeDisabled={creating}
        >
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label>Nom</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Date de naissance</Label>
                <DateInputFr
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  minYear={new Date().getFullYear() - 100}
                  maxYear={new Date().getFullYear()}
                />
              </div>
              <div>
                <Label>Sexe</Label>
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Choisir…</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Téléphone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="ex. 70 12 34 56"
                />
              </div>
              <div>
                <Label>Matricule</Label>
                <Input
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  placeholder="Optionnel"
                />
              </div>
            </div>
            <div>
              <Label>Adresse / quartier</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
            <div>
              <Label>Classe</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Choisir…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {classes.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">
                  Créez d’abord une année scolaire et au moins une classe.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating || classes.length === 0}>
                {creating ? "Création…" : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
            </div>
          </form>

          {result?.familyManaged ? (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              <p className="font-medium text-brand-800">Élève créé en compte famille</p>
              <p className="mt-2 text-slate-700">
                Dans cette classe, l'élève n'a pas de connexion : c'est le parent qui suit son enfant.
                Créez maintenant le compte du parent pour qu'il puisse voir l'élève.
              </p>
              <Link to="/parents" className="mt-2 inline-block font-medium text-brand-700 underline">
                Aller à la page Parents →
              </Link>
            </div>
          ) : result ? (
            <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
              <p className="font-medium text-brand-800">Identifiants créés</p>
              <p className="mt-2">
                Identifiant : <Badge>{result.username}</Badge>
              </p>
              <p className="mt-1">
                Mot de passe temporaire : <Badge tone="warning">{result.tempPassword}</Badge>
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Communiquez ces identifiants à l'élève pour sa première connexion.
              </p>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {totalStudents === 0 && !classesLoadingGuard ? (
        <EmptyState message="Aucun élève inscrit." />
      ) : (
        <div className={cn("space-y-4", selection.count > 0 && "pb-24")}>
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="search-eleves">Rechercher</Label>
                <SearchField
                  id="search-eleves"
                  value={search}
                  onChange={setSearch}
                  placeholder="Nom, classe, identifiant, téléphone…"
                />
              </div>
              <div className="sm:w-72">
                <Label htmlFor="filter-classe-eleves">Classe</Label>
                <ClassFilter
                  id="filter-classe-eleves"
                  value={selectedClassId}
                  onChange={(value) => {
                    setSelectedClassId(value);
                    selection.clear();
                    setBulkClassId("");
                  }}
                  classes={classes}
                  counts={classCounts}
                  total={totalStudents}
                  withoutClassCount={sansClasseCount}
                  showFormer
                />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {filteredTotal} élève{filteredTotal !== 1 ? "s" : ""}
                </span>
                {selectedClassLabel ? ` · ${selectedClassLabel}` : ""}
                {debouncedSearch.trim() ? ` · « ${debouncedSearch.trim()} »` : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void downloadAllCredentials()}
              >
                <Download className="mr-1 h-4 w-4" />
                Télécharger les mots de passe temporaires
              </Button>
            </div>
            <p className="px-4 pb-3 text-xs text-slate-500">
              Les identifiants restent visibles tant que l’élève n’a pas changé son
              mot de passe.
            </p>
            {isLoading ? (
              <p className="border-t border-slate-100 px-4 py-6 text-slate-500 dark:border-slate-700">
                Chargement…
              </p>
            ) : filteredStudents.length === 0 ? (
              <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-700">
                <EmptyState
                  message={
                    debouncedSearch.trim()
                      ? `Aucun élève ne correspond à « ${debouncedSearch.trim()} ». Essayez le prénom seul, ou un autre filtre de classe.`
                      : selectedClassId === "__none__"
                        ? "Aucun élève sans classe."
                        : selectedClassId === "__former__"
                          ? "Aucun ancien élève : personne n'est sorti de l'école."
                          : "Aucun élève dans cette classe."
                  }
                />
                {search.trim() || selectedClassId ? (
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                      Effacer les filtres
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="border-t border-slate-100 dark:border-slate-700">
                <DataTable
                  rows={filteredStudents}
                  columns={studentColumns}
                  mobileRow={studentMobileRow}
                  selectedIds={selection.ids}
                  onToggle={selection.toggle}
                  onTogglePage={selection.setMany}
                  rowLabel={(s) => `Sélectionner ${fullName(s.first_name, s.last_name)}`}
                  dimmed={studentsFetching}
                />
              </div>
            )}
            {filteredTotal > 0 ? (
              <Pagination
                total={filteredTotal}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="élève"
                busy={studentsFetching}
              />
            ) : null}
          </Card>
        </div>
      )}

      {exitTarget ? (
        <SortieEleveModal
          open
          studentId={exitTarget.id}
          studentName={fullName(exitTarget.first_name, exitTarget.last_name)}
          onClose={() => setExitTarget(null)}
          onDone={() => {
            selection.clear();
            invalidateStudentQueries();
          }}
        />
      ) : null}
      {reinstateTarget ? (
        <ReintegrerModal
          open
          studentId={reinstateTarget.id}
          studentName={fullName(reinstateTarget.first_name, reinstateTarget.last_name)}
          classes={classes}
          onClose={() => setReinstateTarget(null)}
          onDone={() => {
            selection.clear();
            invalidateStudentQueries();
          }}
        />
      ) : null}

      <BulkBar count={selection.count} noun="élève" onClear={selection.clear}>
        {canSelectAllResults ? (
          <button
            type="button"
            onClick={() => void selectAllResults()}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-200 underline underline-offset-2 hover:text-white"
          >
            Sélectionner les {filteredTotal} résultats
          </button>
        ) : null}
        {canBulkAssign ? (
          <>
            <Select
              aria-label="Classe cible"
              className="h-9 w-auto max-w-[14rem] py-0 text-sm text-slate-900"
              value={bulkClassId}
              onChange={(e) => setBulkClassId(e.target.value)}
            >
              <option value="">Affecter à…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={bulkAssigning || !bulkClassId || classes.length === 0}
              onClick={() => void handleBulkAssignClass()}
            >
              {bulkAssigning ? "Affectation…" : `Affecter (${selection.count})`}
            </Button>
          </>
        ) : (
          <span className="text-xs text-slate-300">
            Affectation possible uniquement pour des élèves sans classe.
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exportCredentials(selection.rows, "selection")}
        >
          <Download className="mr-1 h-4 w-4" />
          Identifiants (CSV)
        </Button>
      </BulkBar>
    </div>
  );
}
