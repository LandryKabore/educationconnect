import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Download, KeyRound, Link2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { fromAuthEmail, fullName, joinProfile, matchesSearch, personName } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import {
  credentialsToCsv,
  downloadTextFile,
} from "@/lib/studentCsv";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { StudentSearchPicker } from "@/components/StudentSearchPicker";
import { Modal } from "@/components/Modal";
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

type StudentOption = Profile & { className: string | null };

type ParentRow = Profile & { children: string[] };

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
  const { schoolId } = useAuth();
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
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: students = [] } = useQuery({
    queryKey: ["eleves-picker", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true);
      const profiles = (roles ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
      if (!profiles.length) return [] as StudentOption[];

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
        const cls = (row as unknown as { classes?: { name: string } | null })
          .classes;
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

  const { data: parents = [], isLoading } = useQuery({
    queryKey: ["parents", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "parent")
        .eq("active", true);
      if (error) throw error;
      const profiles = (roles ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
      if (!profiles.length) return [] as ParentRow[];

      const { data: links } = await supabase
        .from("liens_parent_eleve")
        .select(
          "parent_id, student_id, profils:profils!liens_parent_eleve_student_id_fkey(first_name, last_name)",
        )
        .in(
          "parent_id",
          profiles.map((p) => p.id),
        );

      const childrenByParent = new Map<string, string[]>();
      for (const link of links ?? []) {
        const child = joinProfile(
          (link as unknown as { profils: unknown }).profils,
        );
        const name = personName(child?.first_name, child?.last_name);
        if (!name) continue;
        const list =
          childrenByParent.get((link as { parent_id: string }).parent_id) ??
          [];
        list.push(name);
        childrenByParent.set(
          (link as { parent_id: string }).parent_id,
          list,
        );
      }

      return profiles.map((p) => ({
        ...p,
        children: childrenByParent.get(p.id) ?? [],
      }));
    },
  });

  const parentIds = useMemo(() => parents.map((p) => p.id), [parents]);

  const { data: credentialsByUser = {} } = useQuery({
    queryKey: ["identifiants-parents", schoolId, parentIds.join(",")],
    enabled: !!schoolId && parentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("identifiants_temporaires")
        .select("user_id, username, temp_password_hint, used")
        .in("user_id", parentIds);
      if (error) throw error;
      const map: Record<string, ParentCredential> = {};
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

  const credentialFor = (p: ParentRow): ParentCredential => {
    const stored = credentialsByUser[p.id];
    if (stored) return stored;
    return {
      username: fromAuthEmail(p.email) || "—",
      tempPassword: null,
      used: !p.must_change_password,
    };
  };

  const filteredParents = useMemo(
    () =>
      parents.filter((p) => {
        const cred = credentialFor(p);
        return matchesSearch(
          search,
          p.first_name,
          p.last_name,
          p.phone,
          cred.username,
          ...(p.children ?? []),
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parents, search, credentialsByUser],
  );

  const invalidateParentQueries = () => {
    void qc.invalidateQueries({ queryKey: ["parents", schoolId] });
    void qc.invalidateQueries({ queryKey: ["identifiants-parents", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const downloadAllCredentials = () => {
    const rows = parents
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
      `identifiants-parents-${new Date().toISOString().slice(0, 10)}.csv`,
      credentialsToCsv(rows),
    );
    toast.success(`${rows.length} identifiant(s) exporté(s)`);
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
                  students={students}
                  value={studentId}
                  onChange={setStudentId}
                  required
                />
                {students.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Créez d’abord des élèves.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={creating || students.length === 0}
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
      ) : parents.length === 0 ? (
        <EmptyState message="Aucun parent enregistré." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-md flex-1">
              <Label htmlFor="search-parents">Rechercher</Label>
              <Input
                id="search-parents"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, enfant, identifiant…"
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
          <p className="text-sm text-slate-500">
            Les identifiants restent visibles ici tant que le parent n’a pas
            changé son mot de passe.
          </p>
          {filteredParents.length === 0 ? (
            <EmptyState message="Aucun parent ne correspond à la recherche." />
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredParents.map((p) => {
                const cred = credentialFor(p);
                const status = accountStatus(p, cred);
                const busy = busyId === p.id;
                return (
                  <Card key={p.id}>
                    <div className="flex flex-col gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">
                          {fullName(p.first_name, p.last_name)}
                        </h3>
                        {p.phone ? (
                          <p className="text-sm text-slate-500">{p.phone}</p>
                        ) : null}
                        {p.children.length > 0 ? (
                          <p className="mt-1 text-sm text-slate-600">
                            Enfant(s) : {p.children.join(", ")}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-amber-700">
                            Aucun enfant lié
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-slate-500">Identifiant</span>
                          <Badge>{cred.username}</Badge>
                          {cred.tempPassword && !cred.used ? (
                            <>
                              <span className="text-slate-500">
                                Mot de passe
                              </span>
                              <Badge tone="warning">{cred.tempPassword}</Badge>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Mot de passe temporaire non affiché
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {status.detail ? (
                            <span className="text-xs text-slate-400">
                              {status.detail}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void runCredentialAction(p, "reset_password")
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
                            void runCredentialAction(p, "recovery_link")
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
        </div>
      )}
    </div>
  );
}
