import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { KeyRound, Link2, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { programmeToCoefMap } from "@/lib/averages";
import { sortClassesByProgression } from "@/lib/classCatalog";
import type {
  AttendanceRow,
  ClassSection,
  EvaluationType,
  GradeRow,
  ParentStudentLink,
  Profile,
  Subject,
} from "@/lib/types";
import { fromAuthEmail, fullName } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import {
  BackLink,
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

const GENDER_LABEL: Record<string, string> = {
  M: "Masculin",
  F: "Féminin",
  other: "Autre",
};

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
  excused: "Justifié",
};

type GradeWithSubject = GradeRow & {
  matieres: Subject | null;
  evaluations: { type: EvaluationType; title: string } | null;
};

type ParentLinkRow = ParentStudentLink & {
  profils: Profile | null;
};

type EnrollmentRow = {
  id: string;
  class_section_id: string;
  academic_year_id: string;
  classes: { name: string; academic_year_id: string | null } | null;
};

export default function EleveDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [assignClassId, setAssignClassId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const backTo =
    typeof (location.state as { elevesList?: unknown } | null)?.elevesList ===
    "string"
      ? (location.state as { elevesList: string }).elevesList
      : "/eleves";

  const { data: student, isLoading } = useQuery({
    queryKey: ["eleve-detail", id, schoolId],
    enabled: !!id && !!schoolId,
    queryFn: async () => {
      const { data: role, error: roleErr } = await supabase
        .from("roles_utilisateurs")
        .select("user_id")
        .eq("user_id", id!)
        .eq("school_id", schoolId!)
        .eq("role", "student")
        .eq("active", true)
        .maybeSingle();
      if (roleErr) throw roleErr;
      if (!role) return null;

      const { data: profil, error } = await supabase
        .from("profils")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return profil as Profile | null;
    },
  });

  const { data: enrollment } = useQuery({
    queryKey: ["eleve-inscription", id],
    enabled: !!id && !!student,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("id, class_section_id, academic_year_id, classes(name, academic_year_id)")
        .eq("student_id", id!)
        .eq("status", "active")
        .maybeSingle();
      return data as EnrollmentRow | null;
    },
  });

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

  const { data: credential } = useQuery({
    queryKey: ["eleve-identifiant", id],
    enabled: !!id && !!student,
    queryFn: async () => {
      const { data } = await supabase
        .from("identifiants_temporaires")
        .select("username, temp_password_hint, used")
        .eq("user_id", id!)
        .maybeSingle();
      return data as {
        username: string;
        temp_password_hint: string | null;
        used: boolean;
      } | null;
    },
  });

  const { data: parents = [] } = useQuery({
    queryKey: ["eleve-parents", id],
    enabled: !!id && !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liens_parent_eleve")
        .select("*, profils:profils!liens_parent_eleve_parent_id_fkey(*)")
        .eq("student_id", id!);
      if (error) throw error;
      return (data ?? []) as ParentLinkRow[];
    },
  });

  const classId = enrollment?.class_section_id;

  const { data: coefMap = {} } = useQuery({
    queryKey: ["programme-coefs", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", classId!);
      return programmeToCoefMap(data ?? []);
    },
  });

  const { data: grades = [], isLoading: gradesLoading } = useQuery({
    queryKey: ["eleve-notes", "v2", id],
    enabled: !!id && !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, matieres(*), evaluations(type, title)")
        .eq("student_id", id!)
        .order("period_label");
      if (error) throw error;
      return data as GradeWithSubject[];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["eleve-presences", id],
    enabled: !!id && !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("presences")
        .select("*, matieres(name)")
        .eq("student_id", id!)
        .order("date", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as (AttendanceRow & {
        matieres: { name: string } | null;
      })[];
    },
  });

  const username =
    credential?.username ?? fromAuthEmail(student?.email) ?? "—";
  const showTempPassword =
    !!credential?.temp_password_hint && !credential.used;

  const accountBadge = (() => {
    if (!student) return null;
    if (!student.must_change_password && (credential?.used || student.last_login_at)) {
      return { label: "Mot de passe modifié", tone: "success" as const };
    }
    if (student.last_login_at) {
      return {
        label: "Connecté · à changer le mot de passe",
        tone: "warning" as const,
      };
    }
    return { label: "Jamais connecté", tone: "default" as const };
  })();

  const selectedAssignId = assignClassId || enrollment?.class_section_id || "";

  const handleAssignClass = async () => {
    if (!id || !assignClassId) {
      toast.error("Choisissez une classe");
      return;
    }
    if (enrollment?.class_section_id === assignClassId) {
      toast.message("L’élève est déjà dans cette classe");
      return;
    }

    const target = classes.find((c) => c.id === assignClassId);
    if (!target?.academic_year_id) {
      toast.error("Cette classe n’a pas d’année scolaire");
      return;
    }

    setAssigning(true);
    try {
      if (enrollment?.id) {
        const { error } = await supabase
          .from("inscriptions")
          .update({
            class_section_id: assignClassId,
            academic_year_id: target.academic_year_id,
            status: "active",
          })
          .eq("id", enrollment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inscriptions").insert({
          student_id: id,
          class_section_id: assignClassId,
          academic_year_id: target.academic_year_id,
          status: "active",
        });
        if (error) throw error;
      }
      toast.success(`Inscrit en ${target.name}`);
      setAssignClassId("");
      void qc.invalidateQueries({ queryKey: ["eleve-inscription", id] });
      void qc.invalidateQueries({ queryKey: ["eleves", schoolId] });
      void qc.invalidateQueries({ queryKey: ["eleves-sans-classe", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
      void qc.invalidateQueries({ queryKey: ["programme-coefs"] });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Réaffectation impossible",
      );
    } finally {
      setAssigning(false);
    }
  };

  const runCredentialAction = async (
    action: "reset_password" | "recovery_link",
  ) => {
    if (!schoolId || !id) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "gerer-identifiant",
        {
          body: {
            action,
            userId: id,
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
        void qc.invalidateQueries({ queryKey: ["eleve-identifiant", id] });
        void qc.invalidateQueries({ queryKey: ["eleve-detail", id] });
        void qc.invalidateQueries({ queryKey: ["identifiants-eleves"] });
      } else if (action === "recovery_link" && res.recoveryLink) {
        const copied = await copyToClipboard(res.recoveryLink);
        if (copied) {
          toast.success("Lien de réinitialisation copié");
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
      setBusy(false);
    }
  };

  if (isLoading) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  if (!student) {
    return (
      <div>
        <BackLink to={backTo} label="Retour aux élèves" />
        <EmptyState message="Élève introuvable." />
      </div>
    );
  }

  return (
    <div>
      <BackLink to={backTo} label="Retour aux élèves" />

      <PageHeader
        title={fullName(student.first_name, student.last_name)}
        subtitle={
          enrollment?.classes?.name
            ? `Classe ${enrollment.classes.name}`
            : "Sans classe"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void runCredentialAction("reset_password")}
            >
              <KeyRound className="mr-1 h-3.5 w-3.5" />
              Nouveau mot de passe
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void runCredentialAction("recovery_link")}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" />
              Lien oublié
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <h3 className="mb-3 font-semibold text-slate-900">Photo de profil</h3>
        <ProfileAvatar
          userId={student.id}
          avatarUrl={student.avatar_url}
          name={fullName(student.first_name, student.last_name)}
          editable
          size="lg"
          invalidateKeys={[
            ["eleve-detail", id, schoolId],
            ["eleves", schoolId],
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold text-slate-900">Informations</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <InfoRow label="Prénom" value={student.first_name} />
            <InfoRow label="Nom" value={student.last_name} />
            <InfoRow
              label="Date de naissance"
              value={
                student.date_of_birth
                  ? format(new Date(student.date_of_birth), "d MMMM yyyy", {
                      locale: fr,
                    })
                  : null
              }
            />
            <InfoRow
              label="Sexe"
              value={
                student.gender
                  ? GENDER_LABEL[student.gender] ?? student.gender
                  : null
              }
            />
            <InfoRow label="Téléphone" value={student.phone} />
            <InfoRow label="Matricule" value={student.matricule} />
            <InfoRow label="Adresse" value={student.address} />
            <InfoRow
              label="Classe"
              value={enrollment?.classes?.name ?? null}
            />
          </dl>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Label>Affecter / changer de classe</Label>
              {!enrollment ? (
                <Badge tone="warning">Sans classe</Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <Select
                  value={selectedAssignId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                >
                  <option value="">
                    {classes.length ? "Choisir une classe…" : "Aucune classe"}
                  </option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={
                  assigning ||
                  !assignClassId ||
                  assignClassId === enrollment?.class_section_id ||
                  classes.length === 0
                }
                onClick={() => void handleAssignClass()}
              >
                {assigning
                  ? "…"
                  : enrollment
                    ? "Réaffecter"
                    : "Inscrire en classe"}
              </Button>
            </div>
            {classes.length === 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                Créez d’abord une classe dans Classes.
              </p>
            ) : !enrollment ? (
              <p className="mt-2 text-xs text-slate-500">
                Choisissez une classe pour réinscrire cet élève.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-slate-900">Compte</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Identifiant</span>
              <Badge>{username}</Badge>
            </div>
            {showTempPassword ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Mot de passe temporaire</span>
                <Badge tone="warning">{credential!.temp_password_hint}</Badge>
              </div>
            ) : (
              <p className="text-slate-400">
                Mot de passe temporaire non affiché
              </p>
            )}
            {accountBadge ? (
              <Badge tone={accountBadge.tone}>{accountBadge.label}</Badge>
            ) : null}
            {student.last_login_at ? (
              <p className="text-xs text-slate-400">
                Dernière connexion :{" "}
                {format(new Date(student.last_login_at), "d MMM yyyy à HH:mm", {
                  locale: fr,
                })}
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-slate-900">Parents liés</h3>
          {parents.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Aucun parent lié à cet élève.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {parents.map((link) => {
                const parentId = link.parent_id || link.profils?.id;
                const parentName = fullName(
                  link.profils?.first_name,
                  link.profils?.last_name,
                );
                return (
                  <li
                    key={link.id}
                    className="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-700"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{parentName}</p>
                        <p className="text-sm text-slate-500">
                          {link.relationship || "parent"}
                          {link.profils?.phone
                            ? ` · ${link.profils.phone}`
                            : ""}
                        </p>
                        {link.profils?.email &&
                        !link.profils.email.endsWith("@edufaso.local") ? (
                          <p className="text-xs text-slate-400">
                            {link.profils.email}
                          </p>
                        ) : null}
                      </div>
                      {parentId && id ? (
                        <Link
                          to={`/messages?avec=${encodeURIComponent(parentId)}&retour=${encodeURIComponent(`/eleves/${id}`)}`}
                        >
                          <Button type="button" size="sm" variant="outline">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Message
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-slate-900">
            Présences récentes
          </h3>
          {attendance.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Aucune présence enregistrée.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {attendance.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {format(new Date(row.date), "d MMM yyyy", { locale: fr })}
                    {(row as { matieres?: { name: string } | null }).matieres
                      ?.name
                      ? ` · ${(row as { matieres: { name: string } }).matieres.name}`
                      : ""}
                  </span>
                  <Badge
                    tone={
                      row.status === "present"
                        ? "success"
                        : row.status === "absent"
                          ? "danger"
                          : row.status === "late"
                            ? "warning"
                            : "info"
                    }
                  >
                    {ATTENDANCE_LABEL[row.status] ?? row.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
          Notes
        </h3>
        {gradesLoading ? (
          <p className="mt-3 text-sm text-slate-500">Chargement…</p>
        ) : grades.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Aucune note enregistrée pour le moment.
          </p>
        ) : (
          <div className="mt-4">
            <NotesPeriodTables
              grades={grades}
              coefficientBySubject={coefMap}
              showEvaluation
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-slate-50 pb-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value?.trim() || "—"}</dd>
    </div>
  );
}
