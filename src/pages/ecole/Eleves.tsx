import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { ClassSection, Profile } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  credentialsToCsv,
  downloadTextFile,
  parseStudentCsv,
  studentCsvTemplate,
  type StudentCsvRow,
} from "@/lib/studentCsv";
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

export default function Eleves() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classId, setClassId] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const [previewRows, setPreviewRows] = useState<StudentCsvRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [defaultClassId, setDefaultClassId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importCreds, setImportCreds] = useState<ImportCredential[]>([]);
  const [importFailed, setImportFailed] = useState<
    { line: number | null; firstName: string; lastName: string; error: string }[]
  >([]);

  const { data: classes = [] } = useQuery({
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

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["eleves", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      if (error) throw error;
      const profiles = (roles ?? []).map(
        (r) => (r as unknown as { profils: Profile }).profils,
      );
      if (!profiles.length) return [];

      const { data: enrollments } = await supabase
        .from("inscriptions")
        .select("student_id, classes(name)")
        .eq("status", "active")
        .in(
          "student_id",
          profiles.map((p) => p.id),
        );

      const classByStudent = new Map<string, string>();
      for (const row of enrollments ?? []) {
        const cls = (row as { classes?: { name: string } | null }).classes;
        if (cls?.name) {
          classByStudent.set(
            (row as { student_id: string }).student_id,
            cls.name,
          );
        }
      }

      return profiles.map((p) => ({
        ...p,
        className: classByStudent.get(p.id) ?? null,
      }));
    },
  });

  const invalidateStudentQueries = () => {
    void qc.invalidateQueries({ queryKey: ["eleves", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["ecole-stats", schoolId] });
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
    setClassId("");
  };

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseStudentCsv(text);
    setParseErrors(parsed.errors);
    setPreviewRows(parsed.rows);
    setImportCreds([]);
    setImportFailed([]);
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

    setImporting(true);
    setImportProgress(`Import de ${previewRows.length} élève(s)…`);
    setImportCreds([]);
    setImportFailed([]);

    const { data, error } = await supabase.functions.invoke("importer-eleves", {
      body: {
        schoolId,
        defaultClassId: defaultClassId || null,
        students: previewRows.map((r) => ({
          line: r.line,
          firstName: r.firstName,
          lastName: r.lastName,
          className: r.className || undefined,
          phone: r.phone || null,
        })),
      },
    });

    setImporting(false);
    setImportProgress("");

    if (error) {
      toast.error(error.message || "Import impossible");
      return;
    }

    const res = data as {
      error?: string;
      created?: ImportCredential[];
      failed?: typeof importFailed;
      summary?: { ok: number; errors: number };
    };

    if (res.error) {
      toast.error(res.error);
      return;
    }

    setImportCreds(res.created ?? []);
    setImportFailed(res.failed ?? []);
    const ok = res.summary?.ok ?? res.created?.length ?? 0;
    const errCount = res.summary?.errors ?? res.failed?.length ?? 0;
    if (ok > 0) {
      toast.success(`${ok} élève(s) importé(s)`);
      invalidateStudentQueries();
    }
    if (errCount > 0) {
      toast.message(`${errCount} ligne(s) en erreur`);
    }
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Élèves"
        subtitle="Création individuelle ou import CSV"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowImport(!showImport);
                setShowForm(false);
              }}
            >
              <Upload className="mr-1 h-4 w-4" />
              Importer CSV
            </Button>
            <Button
              onClick={() => {
                setShowForm(!showForm);
                setShowImport(false);
              }}
            >
              Nouvel élève
            </Button>
          </div>
        }
      />

      {showImport ? (
        <Card className="mb-6 max-w-3xl">
          <h3 className="font-semibold text-slate-900">Import CSV</h3>
          <p className="mt-1 text-sm text-slate-600">
            Colonnes : <code className="text-xs">prenom</code>,{" "}
            <code className="text-xs">nom</code>,{" "}
            <code className="text-xs">classe</code> (optionnel si classe par
            défaut), <code className="text-xs">telephone</code> (optionnel).
            La classe peut être écrite <code className="text-xs">6eme A</code> ou{" "}
            <code className="text-xs">6emeA</code>. Pas besoin de virgule finale
            si le téléphone est vide. Séparateur virgule ou point-virgule. Max
            200 élèves.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTextFile("modele-eleves-edufaso.csv", studentCsvTemplate())
              }
            >
              <Download className="mr-1 h-4 w-4" />
              Télécharger le modèle
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              Choisir un fichier
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="mt-4 max-w-md">
            <Label>Classe par défaut (si absente du CSV)</Label>
            <Select
              value={defaultClassId}
              onChange={(e) => setDefaultClassId(e.target.value)}
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => void runImport()}
                  disabled={importing || classes.length === 0}
                >
                  {importing ? "Import en cours…" : `Importer ${previewRows.length} élève(s)`}
                </Button>
                {importProgress ? (
                  <span className="text-sm text-slate-500">{importProgress}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {importCreds.length > 0 ? (
            <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-brand-900">
                  {importCreds.length} compte(s) créé(s)
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
                Conservez ce fichier : les mots de passe temporaires ne seront plus
                affichés ensuite.
              </p>
              <div className="mt-3 max-h-40 overflow-auto text-sm">
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
          ) : null}

          {importFailed.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
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
        </Card>
      ) : null}

      {showForm ? (
        <Card className="mb-6 max-w-lg">
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
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : students.length === 0 ? (
        <EmptyState message="Aucun élève inscrit." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <Card key={s.id}>
              <h3 className="font-semibold">{fullName(s.first_name, s.last_name)}</h3>
              {s.className ? (
                <p className="mt-1 text-sm text-brand-700">{s.className}</p>
              ) : (
                <p className="mt-1 text-sm text-amber-700">Non inscrit en classe</p>
              )}
              {s.phone ? <p className="text-sm text-slate-500">{s.phone}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
