import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Download, KeyRound, Link2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile } from "@/lib/types";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { fetchEnrollmentsByStudent, fetchByIdChunks } from "@/lib/programmeCounts";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { fromAuthEmail, fullName, joinProfile, matchesSearch } from "@/lib/utils";
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
import { ClassColorBadge, ClassColorDot } from "@/components/ClassColor";
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
}

interface ImportCredential {
  firstName: string;
  lastName: string;
  className: string;
  username: string;
  tempPassword: string;
}

interface StudentCredential {
  username: string;
  tempPassword: string | null;
  used: boolean;
}

type StudentRow = Profile & {
  className: string | null;
  classSectionId: string | null;
};

function accountStatus(s: StudentRow, cred: StudentCredential) {
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
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedClassId = searchParams.get("classe") ?? "";
  const search = searchParams.get("q") ?? "";

  const setSelectedClassId = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("classe", value);
        else next.delete("classe");
        next.delete("q");
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
  const [importFailed, setImportFailed] = useState<
    { line: number | null; firstName: string; lastName: string; error: string }[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
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

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["eleves", schoolId, "v4"],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      if (error) throw error;
      const profiles = (roles ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
      if (!profiles.length) return [];

      const classByStudent = await fetchEnrollmentsByStudent(schoolId!);

      return profiles.map((p) => {
        const cls = classByStudent.get(p.id);
        return {
          ...p,
          className: cls?.name ?? null,
          classSectionId: cls?.id ?? null,
        };
      }) as StudentRow[];
    },
  });

  const studentIds = useMemo(() => students.map((s) => s.id), [students]);

  const { data: credentialsByUser = {} } = useQuery({
    queryKey: ["identifiants-eleves", schoolId, studentIds.join(",")],
    enabled: !!schoolId && studentIds.length > 0,
    queryFn: async () => {
      const rows = await fetchByIdChunks<{
        user_id: string;
        username: string;
        temp_password_hint: string | null;
        used: boolean;
      }>(
        "identifiants_temporaires",
        "user_id",
        studentIds,
        "user_id, username, temp_password_hint, used",
      );
      const map: Record<string, StudentCredential> = {};
      for (const row of rows) {
        map[row.user_id] = {
          username: row.username,
          tempPassword: row.temp_password_hint ?? null,
          used: Boolean(row.used),
        };
      }
      return map;
    },
  });

  const credentialFor = (s: StudentRow): StudentCredential => {
    const stored = credentialsByUser[s.id];
    if (stored) return stored;
    return {
      username: fromAuthEmail(s.email) || "—",
      tempPassword: null,
      used: !s.must_change_password,
    };
  };

  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students
      .filter((s) => {
        if (selectedClassId === "__none__") return !s.classSectionId;
        return s.classSectionId === selectedClassId;
      })
      .filter((s) => {
        const cred = credentialFor(s);
        return matchesSearch(
          search,
          s.first_name,
          s.last_name,
          s.className,
          s.phone,
          cred.username,
        );
      })
      .sort((a, b) =>
        fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- credentialFor depends on credentialsByUser
  }, [students, search, credentialsByUser, selectedClassId]);

  const selectedClassLabel = useMemo(() => {
    if (selectedClassId === "__none__") return "Sans classe";
    return classes.find((c) => c.id === selectedClassId)?.name ?? "";
  }, [selectedClassId, classes]);

  const sansClasseCount = useMemo(
    () => students.filter((s) => !s.classSectionId).length,
    [students],
  );

  const viewingSansClasse = selectedClassId === "__none__";

  const allFilteredSelected =
    viewingSansClasse &&
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedStudentIds.includes(s.id));

  const toggleStudentSelected = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredStudents.map((s) => s.id));
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredSet.has(id)));
      return;
    }
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      for (const s of filteredStudents) next.add(s.id);
      return [...next];
    });
  };

  const handleBulkAssignClass = async () => {
    if (!viewingSansClasse) return;
    if (selectedStudentIds.length === 0) {
      toast.error("Sélectionnez au moins un élève");
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
      const payload = selectedStudentIds.map((studentId) => ({
        student_id: studentId,
        class_section_id: bulkClassId,
        academic_year_id: target.academic_year_id,
        status: "active",
      }));
      const { error } = await supabase.from("inscriptions").insert(payload);
      if (error) throw error;
      toast.success(
        `${payload.length} élève${payload.length > 1 ? "s" : ""} affecté${payload.length > 1 ? "s" : ""} en ${target.name}`,
      );
      setSelectedStudentIds([]);
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
    void qc.invalidateQueries({ queryKey: ["identifiants-eleves", schoolId] });
    void qc.invalidateQueries({ queryKey: ["eleves-sans-classe", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["ecole-stats", schoolId] });
  };

  const downloadAllCredentials = () => {
    const source = selectedClassId ? filteredStudents : students;
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
      toast.message(
        selectedClassId
          ? "Aucun mot de passe temporaire à télécharger pour cette sélection"
          : "Aucun mot de passe temporaire à télécharger",
      );
      return;
    }
    const slug = selectedClassLabel
      ? selectedClassLabel.replace(/\s+/g, "-").toLowerCase()
      : "eleves";
    downloadTextFile(
      `identifiants-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      credentialsToCsv(rows),
    );
    toast.success(`${rows.length} identifiant(s) exporté(s)`);
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
      setResult({
        username: res.username ?? "—",
        tempPassword: res.tempPassword ?? "—",
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
    setImportFailed([]);

    const created: ImportCredential[] = [];
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
        }
      }

      setImportDone(Math.min(i + batch.length, total));
    }

    setImporting(false);
    setImportCreds(created);
    setImportFailed(failed);

    const ok = created.length;
    const errCount = failed.length;
    if (ok > 0) {
      toast.success(`${ok} élève(s) importé(s)`);
      invalidateStudentQueries();
    }
    if (errCount > 0) {
      toast.message(`${errCount} ligne(s) en erreur`);
    }
    if (ok === 0 && errCount === 0) {
      toast.error("Aucun élève importé");
    }
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Élèves"
        subtitle="Comptes, identifiants et import CSV / Excel"
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
              Sélectionnez « Sans classe », cochez les élèves, puis affectez-les
              en masse à une classe.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedClassId("__none__");
              setSelectedStudentIds([]);
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
                    Import terminé — {importCreds.length} compte(s) créé(s)
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadTextFile(
                        "identifiants-eleves-edufaso.csv",
                        credentialsToCsv(importCreds),
                      )
                    }
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Télécharger les identifiants
                  </Button>
                </div>
                <p className="mt-2 text-xs text-brand-800">
                  Conservez ce fichier : les mots de passe temporaires ne
                  seront plus affichés ensuite.
                </p>
                <div className="mt-3 max-h-48 overflow-auto text-sm">
                  {importCreds.slice(0, 20).map((c) => (
                    <p key={c.username} className="py-0.5">
                      {fullName(c.firstName, c.lastName)} ·{" "}
                      <Badge>{c.username}</Badge> ·{" "}
                      <Badge tone="warning">{c.tempPassword}</Badge>
                    </p>
                  ))}
                  {importCreds.length > 20 ? (
                    <p className="text-xs text-slate-500">… voir le fichier CSV</p>
                  ) : null}
                </div>
              </div>

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
            <code className="text-xs">telephone</code>. Première feuille
            Excel. Max 200 élèves.
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

          {result ? (
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

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève inscrit." />
      ) : (
        <div className="space-y-4">
          <Card className="max-w-xl">
            <Label htmlFor="filter-classe-eleves">Classe</Label>
            <Select
              id="filter-classe-eleves"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedStudentIds([]);
                setBulkClassId("");
              }}
            >
              <option value="">Choisir une classe…</option>
              {sansClasseCount > 0 ? (
                <option value="__none__">
                  Sans classe ({sansClasseCount})
                </option>
              ) : null}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {selectedClassId && selectedClassId !== "__none__" ? (
              <div className="mt-3">
                <ClassColorBadge
                  id={selectedClassId}
                  name={selectedClassLabel || "Classe"}
                />
              </div>
            ) : null}
            {classes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedClassId(c.id);
                      setSelectedStudentIds([]);
                      setBulkClassId("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]"
                    title={c.name}
                  >
                    <ClassColorDot id={c.id} name={c.name} />
                    <span className="max-w-[5.5rem] truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          {!selectedClassId ? (
            <EmptyState message="Choisissez une classe pour afficher les élèves." />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="max-w-md flex-1">
                  <Label htmlFor="search-eleves">Rechercher</Label>
                  <Input
                    id="search-eleves"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, identifiant…"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadAllCredentials}
                >
                  <Download className="mr-1 h-4 w-4" />
                  Télécharger les mots de passe temporaires
                </Button>
              </div>
              {viewingSansClasse && filteredStudents.length > 0 ? (
                <Card className="border-amber-200 bg-amber-50/60">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                      />
                      Tout sélectionner ({filteredStudents.length})
                    </label>
                    <div className="min-w-[12rem] flex-1">
                      <Label htmlFor="bulk-class">Classe cible</Label>
                      <Select
                        id="bulk-class"
                        value={bulkClassId}
                        onChange={(e) => setBulkClassId(e.target.value)}
                      >
                        <option value="">Choisir…</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      type="button"
                      disabled={
                        bulkAssigning ||
                        selectedStudentIds.length === 0 ||
                        !bulkClassId ||
                        classes.length === 0
                      }
                      onClick={() => void handleBulkAssignClass()}
                    >
                      {bulkAssigning
                        ? "Affectation…"
                        : `Affecter (${selectedStudentIds.length})`}
                    </Button>
                  </div>
                  {selectedStudentIds.length > 0 ? (
                    <p className="mt-2 text-xs text-amber-900">
                      {selectedStudentIds.length} élève
                      {selectedStudentIds.length > 1 ? "s" : ""} sélectionné
                      {selectedStudentIds.length > 1 ? "s" : ""}.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-amber-800">
                      Cochez les élèves à affecter, choisissez une classe, puis
                      validez.
                    </p>
                  )}
                </Card>
              ) : null}
              <p className="text-sm text-slate-500">
                {filteredStudents.length} élève
                {filteredStudents.length !== 1 ? "s" : ""}
                {selectedClassLabel ? ` · ${selectedClassLabel}` : ""}. Les
                identifiants restent visibles tant que l’élève n’a pas changé
                son mot de passe.
              </p>
              {filteredStudents.length === 0 ? (
                <EmptyState
                  message={
                    search.trim()
                      ? "Aucun élève ne correspond à la recherche."
                      : selectedClassId === "__none__"
                        ? "Aucun élève sans classe."
                        : "Aucun élève dans cette classe."
                  }
                />
              ) : (
                <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredStudents.map((s) => {
                    const cred = credentialFor(s);
                    const status = accountStatus(s, cred);
                    const busy = busyId === s.id;
                    const checked = selectedStudentIds.includes(s.id);
                    return (
                      <Card
                        key={s.id}
                        className={
                          viewingSansClasse && checked
                            ? "border-brand-300 bg-brand-50/40 transition hover:border-brand-300 hover:shadow-md"
                            : "transition hover:border-brand-300 hover:shadow-md"
                        }
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            {viewingSansClasse ? (
                              <input
                                type="checkbox"
                                className="mt-2 h-4 w-4 shrink-0 rounded border-slate-300"
                                checked={checked}
                                onChange={() => toggleStudentSelected(s.id)}
                                aria-label={`Sélectionner ${fullName(s.first_name, s.last_name)}`}
                              />
                            ) : null}
                            <Link
                              to={`/eleves/${s.id}`}
                              state={{
                                elevesList: searchParams.toString()
                                  ? `/eleves?${searchParams.toString()}`
                                  : "/eleves",
                              }}
                              className="flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none ring-brand-500 focus-visible:ring-2"
                            >
                              <ProfileAvatar
                                userId={s.id}
                                avatarUrl={s.avatar_url}
                                name={fullName(s.first_name, s.last_name)}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-slate-900 hover:text-brand-800">
                                  {fullName(s.first_name, s.last_name)}
                                </h4>
                                {s.phone ? (
                                  <p className="text-sm text-slate-500">
                                    {s.phone}
                                  </p>
                                ) : null}
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-slate-500">
                                    Identifiant
                                  </span>
                                  <Badge>{cred.username}</Badge>
                                  {cred.tempPassword && !cred.used ? (
                                    <>
                                      <span className="text-slate-500">
                                        Mot de passe
                                      </span>
                                      <Badge tone="warning">
                                        {cred.tempPassword}
                                      </Badge>
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-400">
                                      Mot de passe temporaire non affiché
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Badge tone={status.tone}>
                                    {status.label}
                                  </Badge>
                                  {status.detail ? (
                                    <span className="text-xs text-slate-400">
                                      {status.detail}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-xs font-medium text-brand-700">
                                  Voir le profil →
                                </p>
                              </div>
                            </Link>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void runCredentialAction(s, "reset_password")
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
                                void runCredentialAction(s, "recovery_link")
                              }
                            >
                              <Link2 className="mr-1 h-3.5 w-3.5" />
                              Lien oublié
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
