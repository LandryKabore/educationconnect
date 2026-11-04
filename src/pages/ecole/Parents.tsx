import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Download, FileText, KeyRound, Link2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn, fromAuthEmail, fullName } from "@/lib/utils";
import {
  fetchAllParents,
  fetchParentsPage,
  type ParentPageRow,
} from "@/lib/scaleApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageParams } from "@/hooks/usePageParams";
import { useRowSelection } from "@/hooks/useRowSelection";
import { copyToClipboard } from "@/lib/clipboard";
import {
  credentialsToCsv,
  downloadTextFile,
} from "@/lib/studentCsv";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { StudentSearchPicker } from "@/components/StudentSearchPicker";
import { Modal } from "@/components/Modal";
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
  Select,
} from "@/components/ui";

interface CreateResult {
  username: string;
  tempPassword: string;
}

type ParentRow = ParentPageRow;

interface ParentCredential {
  username: string;
  tempPassword: string | null;
  used: boolean;
}

function accountStatus(p: ParentRow, cred: ParentCredential) {
  if (!p.must_change_password && (cred.used || p.last_login_at)) {
    return {
      label: "Mot de passe modifié",
      tone: "success" as const,
      detail: p.last_login_at
        ? `Dernière connexion : ${format(new Date(p.last_login_at), "d MMM yyyy à HH:mm", { locale: fr })}`
        : null,
    };
  }
  if (p.last_login_at) {
    return {
      label: "Connecté · à changer le mot de passe",
      tone: "warning" as const,
      detail: `Dernière connexion : ${format(new Date(p.last_login_at), "d MMM yyyy à HH:mm", { locale: fr })}`,
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

export default function Parents() {
  const { schoolId, schools } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [address, setAddress] = useState("");
  const [relationship, setRelationship] = useState("pere");
  const [studentId, setStudentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [busyId, setBusyId] = useState<string | null>(null);

  // One page at a time, searched and counted by the database.  (The old page asked for
  // every parent, then sent all their ids in one URL, which failed with "400 Bad Request"
  // in big schools.)
  const debouncedSearch = useDebouncedValue(search, 300);
  const {
    data: parentsPage,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["parents", schoolId, "v3", debouncedSearch, page, pageSize],
    placeholderData: keepPreviousData,
    enabled: !!schoolId,
    queryFn: () =>
      fetchParentsPage(schoolId!, {
        search: debouncedSearch,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });
  const parents = useMemo(() => parentsPage?.rows ?? [], [parentsPage]);
  const parentsTotal = parentsPage?.total ?? 0;

  // a page number from an old link that no longer exists → last page
  useEffect(() => {
    if (!parentsPage || isFetching) return;
    const last = Math.max(1, Math.ceil(parentsPage.total / pageSize));
    if (page > last) setPage(last);
  }, [parentsPage, isFetching, page, pageSize, setPage]);

  const selection = useRowSelection<ParentRow>();
  const pageFullySelected =
    parents.length > 0 && parents.every((p) => selection.ids.has(p.id));
  const canSelectAllResults = pageFullySelected && parentsTotal > selection.count;

  const selectAllResults = async () => {
    if (!schoolId) return;
    try {
      const all = await fetchAllParents(schoolId, { search: debouncedSearch });
      selection.setMany(all, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sélection impossible");
    }
  };

  const credentialFor = (p: ParentRow): ParentCredential => {
    const stored = p.cred;
    if (stored)
      return {
        username: stored.username ?? "—",
        tempPassword: stored.tempPassword ?? null,
        used: Boolean(stored.used),
      };
    return {
      username: fromAuthEmail(p.email) || "—",
      tempPassword: null,
      used: !p.must_change_password,
    };
  };

  const invalidateParentQueries = () => {
    void qc.invalidateQueries({ queryKey: ["parents", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const exportCredentials = (source: ParentRow[], slug: string) => {
    const rows = source
      .map((p) => {
        const cred = credentialFor(p);
        if (!cred.tempPassword || cred.used) return null;
        return {
          firstName: p.first_name,
          lastName: p.last_name,
          className: (p.children ?? []).join(" / "),
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
      `identifiants-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      credentialsToCsv(rows),
    );
    toast.success(`${rows.length} identifiant(s) exporté(s)`);
  };

  // "fiche famille": one printable card per parent (login + temporary password + children)
  const printFamilySheets = async (source: ParentRow[]) => {
    const fiches = source
      .map((p) => {
        const cred = credentialFor(p);
        if (!cred.tempPassword || cred.used) return null;
        return {
          parentName: fullName(p.first_name, p.last_name),
          children: p.children ?? [],
          username: cred.username,
          tempPassword: cred.tempPassword,
        };
      })
      .filter(Boolean) as { parentName: string; children: string[]; username: string; tempPassword: string }[];
    if (fiches.length === 0) {
      toast.message("Aucun mot de passe temporaire à imprimer");
      return;
    }
    const { generateFichesFamillePdf } = await import("@/lib/pdfFichesFamille");
    const doc = generateFichesFamillePdf({
      schoolName: schools.find((x) => x.id === schoolId)?.name ?? "École",
      appUrl: window.location.origin,
      fiches,
    });
    doc.save(`fiches-famille-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success(`${fiches.length} fiche(s) famille créée(s)`);
  };

  const printAllFamilySheets = async () => {
    if (!schoolId) return;
    try {
      const all = await fetchAllParents(schoolId, { search: debouncedSearch });
      await printFamilySheets(all);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impression impossible");
    }
  };

  const downloadAllCredentials = async () => {
    if (!schoolId) return;
    // every parent matching the search, not only the page on screen
    let all: ParentRow[];
    try {
      all = await fetchAllParents(schoolId, { search: debouncedSearch });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export impossible");
      return;
    }
    exportCredentials(all, "parents");
  };

  const runCredentialAction = async (
    parent: ParentRow,
    action: "reset_password" | "recovery_link",
  ) => {
    if (!schoolId) return;
    setBusyId(parent.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        "gerer-identifiant",
        {
          body: {
            action,
            userId: parent.id,
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
        invalidateParentQueries();
      } else if (action === "recovery_link" && res.recoveryLink) {
        const copied = await copyToClipboard(res.recoveryLink);
        if (copied) {
          toast.success("Lien de réinitialisation copié", {
            description: "Envoyez-le au parent.",
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

  const parentMenu = (p: ParentRow) => [
    {
      label: "Nouveau mot de passe",
      icon: <KeyRound className="h-4 w-4" />,
      onSelect: () => void runCredentialAction(p, "reset_password"),
    },
    {
      label: "Lien oublié",
      icon: <Link2 className="h-4 w-4" />,
      onSelect: () => void runCredentialAction(p, "recovery_link"),
    },
  ];

  const parentColumns: DataTableColumn<ParentRow>[] = [
    {
      key: "parent",
      header: "Parent",
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {fullName(p.first_name, p.last_name)}
          </p>
          {p.phone ? <p className="text-xs text-slate-500">{p.phone}</p> : null}
        </div>
      ),
    },
    {
      key: "enfants",
      header: "Enfant(s)",
      cell: (p) =>
        p.children.length > 0 ? (
          <span className="text-slate-600">{p.children.join(", ")}</span>
        ) : (
          <span className="text-xs font-medium text-amber-700">Aucun enfant lié</span>
        ),
    },
    {
      key: "identifiant",
      header: "Identifiant",
      hideBelowLg: true,
      cell: (p) => {
        const cred = credentialFor(p);
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
      cell: (p) => {
        const status = accountStatus(p, credentialFor(p));
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
      cell: (p) => (
        <RowMenu
          label={`Actions pour ${fullName(p.first_name, p.last_name)}`}
          busy={busyId === p.id}
          items={parentMenu(p)}
        />
      ),
    },
  ];

  const parentMobileRow = (p: ParentRow) => {
    const cred = credentialFor(p);
    const status = accountStatus(p, cred);
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {fullName(p.first_name, p.last_name)}
          </p>
          <p className="text-xs text-slate-500">
            {p.children.length > 0
              ? `Enfant(s) : ${p.children.join(", ")}`
              : "Aucun enfant lié"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-xs text-slate-500">{cred.username}</span>
            {cred.tempPassword && !cred.used ? (
              <Badge tone="warning">{cred.tempPassword}</Badge>
            ) : null}
          </div>
        </div>
        <RowMenu
          label={`Actions pour ${fullName(p.first_name, p.last_name)}`}
          busy={busyId === p.id}
          items={parentMenu(p)}
        />
      </div>
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setCreating(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("creer-utilisateur", {
      body: {
        role: "parent",
        schoolId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        studentId: studentId || undefined,
        phone: phone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        address: address.trim() || null,
        relationship: relationship || "parent",
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
    setResult({
      username: res.username ?? "—",
      tempPassword: res.tempPassword ?? "—",
    });
    toast.success("Parent créé et lié à l'élève");
    invalidateParentQueries();

    setCreating(false);
    setFirstName("");
    setLastName("");
    setPhone("");
    setContactEmail("");
    setAddress("");
    setRelationship("pere");
    setStudentId("");
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Parents"
        subtitle="Comptes, identifiants et liaison avec les élèves"
        actions={
          <Button onClick={() => setShowForm(true)}>Nouveau parent</Button>
        }
      />

      {showForm ? (
        <Modal
          open={showForm}
          title="Nouveau parent"
          onClose={() => setShowForm(false)}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Téléphone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="ex. 70 12 34 56"
                  required
                />
              </div>
              <div>
                <Label>E-mail de contact</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Lien avec l’élève</Label>
                <Select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  required
                >
                  <option value="pere">Père</option>
                  <option value="mere">Mère</option>
                  <option value="tuteur">Tuteur / Tutrice</option>
                  <option value="autre">Autre</option>
                </Select>
              </div>
              <div>
                <Label>Élève à lier</Label>
                <StudentSearchPicker
                  schoolId={schoolId ?? undefined}
                  value={studentId}
                  onChange={setStudentId}
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={creating}
              >
                {creating ? "Création…" : "Créer"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
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
                Mot de passe temporaire :{" "}
                <Badge tone="warning">{result.tempPassword}</Badge>
              </p>
              <p className="mt-2 text-xs text-brand-800">
                Ces identifiants restent aussi visibles dans la liste ci-dessous.
              </p>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : parentsTotal === 0 && !debouncedSearch.trim() ? (
        <EmptyState message="Aucun parent enregistré." />
      ) : (
        <div className={cn("space-y-4", selection.count > 0 && "pb-24")}>
          <Card className="p-4">
            <Label htmlFor="search-parents">Rechercher</Label>
            <SearchField
              id="search-parents"
              className="max-w-xl"
              value={search}
              onChange={setSearch}
              placeholder="Nom, enfant, identifiant, téléphone…"
            />
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {parentsTotal} parent{parentsTotal !== 1 ? "s" : ""}
                </span>
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
              <Button type="button" variant="outline" size="sm" onClick={() => void printAllFamilySheets()}>
                <FileText className="mr-1 h-4 w-4" />
                Fiches famille (PDF)
              </Button>
            </div>
            <p className="px-4 pb-3 text-xs text-slate-500">
              Les identifiants restent visibles ici tant que le parent n’a pas
              changé son mot de passe.
            </p>
            {parents.length === 0 ? (
              <div className="space-y-3 border-t border-slate-100 p-4 dark:border-slate-700">
                <EmptyState
                  message={`Aucun parent ne correspond à « ${debouncedSearch.trim()} ». Essayez le nom seul, ou le prénom de l’enfant.`}
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
                  rows={parents}
                  columns={parentColumns}
                  mobileRow={parentMobileRow}
                  selectedIds={selection.ids}
                  onToggle={selection.toggle}
                  onTogglePage={selection.setMany}
                  rowLabel={(p) => `Sélectionner ${fullName(p.first_name, p.last_name)}`}
                  dimmed={isFetching}
                />
              </div>
            )}
            {parentsTotal > 0 ? (
              <Pagination
                total={parentsTotal}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="parent"
                busy={isFetching}
              />
            ) : null}
          </Card>
        </div>
      )}

      <BulkBar count={selection.count} noun="parent" onClear={selection.clear}>
        {canSelectAllResults ? (
          <button
            type="button"
            onClick={() => void selectAllResults()}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-200 underline underline-offset-2 hover:text-white"
          >
            Sélectionner les {parentsTotal} résultats
          </button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => exportCredentials(selection.rows, "parents-selection")}
        >
          <Download className="mr-1 h-4 w-4" />
          Identifiants (CSV)
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void printFamilySheets(selection.rows)}>
          <FileText className="mr-1 h-4 w-4" />
          Fiches famille (PDF)
        </Button>
      </BulkBar>
    </div>
  );
}
