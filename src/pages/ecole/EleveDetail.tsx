import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ChevronDown,
  KeyRound,
  Link2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Undo2,
  UserCheck,
  UserX,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  TRIMESTER_PERIODS,
  bulletinMention,
  computeWeightedAverage,
  programmeToCoefMap,
} from "@/lib/averages";
import { attendanceRate, type AttendanceTotals } from "@/lib/attendance";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { useResolvedGradingPeriod } from "@/hooks/useGradingPeriodState";
import type {
  AcademicYear,
  AttendanceRow,
  AttendanceStatus,
  ClassSection,
  EvaluationType,
  GradeRow,
  ParentStudentLink,
  Profile,
  Subject,
} from "@/lib/types";
import { cn, fromAuthEmail, fullName } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { fetchClassStudentCounts, exitReasonLabel, setStudentIdentity } from "@/lib/scaleApi";
import { NotesPeriodTables } from "@/components/NotesPeriodTables";
import { ProfileAvatar, type ProfileAvatarHandle } from "@/components/ProfileAvatar";
import { ParcoursCard } from "@/components/ParcoursCard";
import { Modal } from "@/components/Modal";
import { ReintegrerModal, SortieEleveModal } from "@/components/SortieEleve";
import {
  BackLink,
  Badge,
  Button,
  Card,
  DateInputFr,
  EmptyState,
  Label,
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

const STRIP_LETTER: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  late: "R",
  excused: "J",
};

const STRIP_CLASS: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800",
  absent: "bg-red-100 text-red-800",
  late: "bg-amber-100 text-amber-900",
  excused: "bg-sky-100 text-sky-800",
};

const TERM_TITLE: Record<string, { full: string; short: string }> = {
  "Trimestre 1": { full: "1er trimestre", short: "T1" },
  "Trimestre 2": { full: "2e trimestre", short: "T2" },
  "Trimestre 3": { full: "3e trimestre", short: "T3" },
};

const TABS = [
  { id: "apercu", label: "Aperçu", short: "Aperçu" },
  { id: "notes", label: "Notes", short: "Notes" },
  { id: "presences", label: "Présences", short: "Présences" },
  { id: "compte", label: "Compte & accès", short: "Compte" },
  { id: "famille", label: "Famille", short: "Famille" },
  { id: "parcours", label: "Parcours", short: "Parcours" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type GradeWithSubject = GradeRow & {
  matieres: Subject | null;
  evaluations: {
    type: EvaluationType;
    title: string;
    eval_date: string | null;
  } | null;
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

type FormerRow = {
  left_at: string | null;
  exit_reason: string | null;
  exit_note: string | null;
  classes: { name: string } | null;
};

type StripRow = {
  id: string;
  date: string;
  status: AttendanceStatus;
  subject: string | null;
  note: string | null;
};

type WindowStats = {
  rate: number | null;
  classRate: number | null;
  absences: number;
  unjustified: number;
  lates: number;
  latestLate: { date: string; subject: string | null } | null;
};

type MenuItem = {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

function subjectName(raw: unknown): string | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return subjectName(raw[0]);
  if (typeof raw === "object" && raw && "name" in raw) {
    const name = (raw as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? name : null;
  }
  return null;
}

function ageYears(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date();
  let age = now.getFullYear() - year;
  const nowMonth = now.getMonth() + 1;
  if (nowMonth < month || (nowMonth === month && now.getDate() < day)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function formatScore(value: number): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${text} %`;
}

function telHref(phone: string): string | null {
  const compact = phone.replace(/[^\d+]/g, "");
  if (!compact) return null;
  if (compact.startsWith("+")) return `tel:${compact}`;
  if (compact.startsWith("00")) return `tel:+${compact.slice(2)}`;
  if (/^\d{8}$/.test(compact)) return `tel:+226${compact}`;
  if (compact.startsWith("226")) return `tel:+${compact}`;
  return `tel:${compact}`;
}

function relationLabel(value: string | null): string {
  const text = (value || "parent").trim();
  return text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
}

function enrolledWord(gender: string | null | undefined): string {
  if (gender === "F") return "Inscrite";
  if (gender === "M") return "Inscrit";
  return "Inscrit(e)";
}

function formerWord(gender: string | null | undefined): string {
  if (gender === "F") return "Ancienne élève";
  if (gender === "M") return "Ancien élève";
  return "Ancien élève";
}

function bornWord(gender: string | null | undefined): string {
  if (gender === "F") return "Née le";
  if (gender === "M") return "Né le";
  return "Né(e) le";
}

function absentWord(gender: string | null | undefined): string {
  if (gender === "F") return "Absente";
  if (gender === "M") return "Absent";
  return "Absence";
}

function justifyHref(studentId: string, date: string): string {
  const day = date.slice(0, 10);
  const params = new URLSearchParams({
    eleve: studentId,
    statut: "absent",
    du: day,
    au: day,
  });
  return `/presences-ecole?${params.toString()}`;
}

function yearOf(years: AcademicYear[], yearId: string | null | undefined): string | null {
  if (!yearId) return null;
  return years.find((year) => year.id === yearId)?.label ?? null;
}

export default function EleveDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showReinstate, setShowReinstate] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [familyAction, setFamilyAction] = useState<"give_account" | "make_family_managed" | null>(null);
  const [familyBusy, setFamilyBusy] = useState(false);

  const backTo =
    typeof (location.state as { elevesList?: unknown } | null)?.elevesList === "string"
      ? (location.state as { elevesList: string }).elevesList
      : "/eleves";

  const since = useMemo(() => format(subDays(new Date(), 29), "yyyy-MM-dd"), []);

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

  const enrollmentQuery = useQuery({
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
  const enrollment = enrollmentQuery.data ?? null;
  const enrollmentReady = enrollmentQuery.isFetched;

  const formerQuery = useQuery({
    queryKey: ["eleve-sortie", id],
    enabled: !!id && !!student && enrollmentReady && !enrollment,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("left_at, exit_reason, exit_note, classes(name)")
        .eq("student_id", id!)
        .eq("status", "sorti")
        .order("left_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as FormerRow | null;
    },
  });
  const former = formerQuery.data ?? null;
  const rosterReady = enrollmentReady && (!!enrollment || formerQuery.isFetched);

  const { data: classesRaw = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").eq("school_id", schoolId!).order("name");
      return (data ?? []) as ClassSection[];
    },
  });
  const classes = useMemo(() => sortClassesByProgression(classesRaw), [classesRaw]);

  const { data: years = [] } = useQuery({
    queryKey: ["annees", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("annees_scolaires")
        .select("*")
        .eq("school_id", schoolId!)
        .order("start_date", { ascending: false });
      return (data ?? []) as AcademicYear[];
    },
  });

  const countsQuery = useQuery({
    queryKey: ["eleves-class-counts", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchClassStudentCounts(schoolId!),
  });

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
  // same term as the bulletins and grade pages: the school's open trimester
  // (its real dates and closures), not a guess from the calendar month
  const { suggested: termLabel } = useResolvedGradingPeriod(TRIMESTER_PERIODS, {
    classSectionId: classId,
    schoolId,
  });

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
        .select("*, matieres(*), evaluations(type, title, eval_date)")
        .eq("student_id", id!)
        .order("period_label");
      if (error) throw error;
      return data as GradeWithSubject[];
    },
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
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
      return (data ?? []) as (AttendanceRow & { matieres: { name: string } | null })[];
    },
  });

  const windowQuery = useQuery({
    queryKey: ["eleve-presences-30j", id, classId ?? "", since],
    enabled: !!id && !!student,
    queryFn: async (): Promise<WindowStats> => {
      const countStatus = async (scope: "student" | "class", status?: AttendanceStatus) => {
        let query = supabase
          .from("presences")
          .select("id", { count: "exact", head: true })
          .gte("date", since);
        query =
          scope === "student"
            ? query.eq("student_id", id!)
            : query.eq("class_section_id", classId!);
        if (status) query = query.eq("status", status);
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      };

      const lateQuery = supabase
        .from("presences")
        .select("date, matieres(name)")
        .eq("student_id", id!)
        .eq("status", "late")
        .gte("date", since)
        .order("date", { ascending: false })
        .limit(1);

      const [total, absent, late, excused, lateRes, classPair] = await Promise.all([
        countStatus("student"),
        countStatus("student", "absent"),
        countStatus("student", "late"),
        countStatus("student", "excused"),
        lateQuery,
        classId
          ? Promise.all([countStatus("class"), countStatus("class", "absent")])
          : Promise.resolve(null),
      ]);
      if (lateRes.error) throw lateRes.error;

      const totals: AttendanceTotals = {
        total,
        absent,
        late,
        excused,
        present: Math.max(total - absent - late - excused, 0),
      };
      const lateRaw = (lateRes.data?.[0] ?? null) as { date: string; matieres: unknown } | null;
      const classRate = classPair
        ? attendanceRate({
            total: classPair[0],
            absent: classPair[1],
            late: 0,
            excused: 0,
            present: Math.max(classPair[0] - classPair[1], 0),
          })
        : null;

      return {
        rate: attendanceRate(totals),
        classRate,
        absences: absent + excused,
        unjustified: absent,
        lates: late,
        latestLate: lateRaw ? { date: lateRaw.date, subject: subjectName(lateRaw.matieres) } : null,
      };
    },
  });

  const username = credential?.username ?? fromAuthEmail(student?.email) ?? "—";
  const showTempPassword = !!credential?.temp_password_hint && !credential.used;

  const accountBadge = (() => {
    if (!student) return null;
    if (!student.must_change_password && (credential?.used || student.last_login_at)) {
      return { label: "Mot de passe modifié", tone: "success" as const };
    }
    if (student.last_login_at) {
      return { label: "Connecté · à changer le mot de passe", tone: "warning" as const };
    }
    return { label: "Jamais connecté", tone: "default" as const };
  })();

  const strip: StripRow[] = attendance.map((row) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    subject: subjectName(row.matieres),
    note: row.note,
  }));

  const refreshAfterChange = () => {
    void qc.invalidateQueries({ queryKey: ["eleve-inscription", id] });
    void qc.invalidateQueries({ queryKey: ["eleve-sortie", id] });
    void qc.invalidateQueries({ queryKey: ["eleve-detail", id] });
    void qc.invalidateQueries({ queryKey: ["eleve-identifiant", id] });
    void qc.invalidateQueries({ queryKey: ["parcours", id] });
    void qc.invalidateQueries({ queryKey: ["eleves", schoolId] });
    void qc.invalidateQueries({ queryKey: ["eleves-class-counts", schoolId] });
    void qc.invalidateQueries({ queryKey: ["eleves-sans-classe", schoolId] });
    void qc.invalidateQueries({ queryKey: ["departs", schoolId] });
    void qc.invalidateQueries({ queryKey: ["family-overview", schoolId] });
  };

  const handleAssignClass = async (nextClassId: string): Promise<boolean> => {
    if (!id || !nextClassId) {
      toast.error("Choisissez une classe");
      return false;
    }
    if (enrollment?.class_section_id === nextClassId) {
      toast.message("L’élève est déjà dans cette classe");
      return false;
    }

    const target = classes.find((item) => item.id === nextClassId);
    if (!target?.academic_year_id) {
      toast.error("Cette classe n’a pas d’année scolaire");
      return false;
    }

    setAssigning(true);
    try {
      if (enrollment?.id) {
        const { error } = await supabase
          .from("inscriptions")
          .update({
            class_section_id: nextClassId,
            academic_year_id: target.academic_year_id,
            status: "active",
          })
          .eq("id", enrollment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inscriptions").insert({
          student_id: id,
          class_section_id: nextClassId,
          academic_year_id: target.academic_year_id,
          status: "active",
        });
        if (error) throw error;
      }
      toast.success(`Inscrit en ${target.name}`);
      void qc.invalidateQueries({ queryKey: ["eleve-inscription", id] });
      void qc.invalidateQueries({ queryKey: ["eleves", schoolId] });
      void qc.invalidateQueries({ queryKey: ["eleves-sans-classe", schoolId] });
      void qc.invalidateQueries({ queryKey: ["eleves-class-counts", schoolId] });
      void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
      void qc.invalidateQueries({ queryKey: ["programme-coefs"] });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Réaffectation impossible");
      return false;
    } finally {
      setAssigning(false);
    }
  };

  const runCredentialAction = async (
    action: "reset_password" | "recovery_link",
  ): Promise<boolean> => {
    if (!schoolId || !id) return false;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerer-identifiant", {
        body: {
          action,
          userId: id,
          schoolId,
          redirectTo: `${window.location.origin}/premiere-connexion`,
        },
      });
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
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveIdentity = async (gender: string, dob: string): Promise<boolean> => {
    if (!id) return false;
    if (!gender && !dob) {
      toast.error("Renseignez le sexe ou la date de naissance");
      return false;
    }
    setSavingIdentity(true);
    try {
      await setStudentIdentity(id, gender || null, dob || null);
      toast.success("Informations enregistrées");
      refreshAfterChange();
      void qc.invalidateQueries({ queryKey: ["identity-gaps", schoolId] });
      void qc.invalidateQueries({ queryKey: ["statistiques", schoolId] });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
      return false;
    } finally {
      setSavingIdentity(false);
    }
  };

  const runFamilyAction = async () => {
    if (!schoolId || !id || !familyAction) return;
    setFamilyBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("gerer-identifiant", {
        body: { action: familyAction, userId: id, schoolId },
      });
      if (error) throw error;
      const res = data as { error?: string; tempPassword?: string; username?: string };
      if (res.error) throw new Error(res.error);
      if (familyAction === "give_account" && res.tempPassword) {
        const creds = `${res.username}\n${res.tempPassword}`;
        toast.success("Compte élève activé", {
          description: `${res.username ?? ""} · ${res.tempPassword}`,
          action: { label: "Copier", onClick: () => void copyToClipboard(creds) },
          duration: 30_000,
        });
      } else {
        toast.success("Compte famille activé : le parent est maintenant le seul accès");
      }
      setFamilyAction(null);
      refreshAfterChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setFamilyBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <BackLink to={backTo} label="Retour aux élèves" className="min-h-11" />
        <ProfileSkeleton />
      </div>
    );
  }

  if (!student || !id) {
    return (
      <div>
        <BackLink to={backTo} label="Retour aux élèves" className="min-h-11" />
        <EmptyState message="Élève introuvable." />
      </div>
    );
  }

  return (
    <>
      <EleveFiche
        backTo={backTo}
        student={student}
        enrollment={enrollment}
        enrollmentReady={rosterReady}
        former={former ?? null}
        classes={classes}
        years={years}
        classCounts={countsQuery.data}
        countsLoading={countsQuery.isLoading}
        countsError={countsQuery.isError}
        username={username}
        showTempPassword={showTempPassword}
        tempPassword={credential?.temp_password_hint ?? null}
        accountBadge={accountBadge}
        parents={parents}
        strip={strip}
        attendanceLoading={attendanceLoading}
        windowStats={windowQuery.data ?? null}
        windowLoading={windowQuery.isLoading}
        windowError={windowQuery.isError}
        grades={grades}
        gradesLoading={gradesLoading}
        coefMap={coefMap}
        termLabel={termLabel}
        busy={busy}
        assigning={assigning}
        savingIdentity={savingIdentity}
        onResetPassword={() => runCredentialAction("reset_password")}
        onRecoveryLink={() => runCredentialAction("recovery_link")}
        onOpenFamily={setFamilyAction}
        onExit={() => setShowExit(true)}
        onReinstate={() => setShowReinstate(true)}
        onAssignClass={handleAssignClass}
        onSaveIdentity={saveIdentity}
      />
      {showExit ? (
        <SortieEleveModal
          open
          studentId={id}
          studentName={fullName(student.first_name, student.last_name)}
          onClose={() => setShowExit(false)}
          onDone={refreshAfterChange}
        />
      ) : null}
      {showReinstate ? (
        <ReintegrerModal
          open
          studentId={id}
          studentName={fullName(student.first_name, student.last_name)}
          classes={classes}
          onClose={() => setShowReinstate(false)}
          onDone={refreshAfterChange}
        />
      ) : null}
      <Modal
        open={familyAction !== null}
        title={familyAction === "give_account" ? "Donner un compte à l'élève" : "Passer en compte famille"}
        onClose={() => setFamilyAction(null)}
        closeDisabled={familyBusy}
      >
        <div className="space-y-4 text-sm text-slate-700">
          {familyAction === "give_account" ? (
            <p>
              L'élève aura son propre identifiant et un mot de passe temporaire à lui remettre. Le compte du parent
              reste inchangé.
            </p>
          ) : (
            <p>
              Le login de l'élève sera <strong>fermé</strong> (son mot de passe ne marchera plus). Les parents
              gardent leur accès et voient tout. Il faut au moins un parent lié.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" disabled={familyBusy} onClick={() => void runFamilyAction()}>
              {familyBusy ? "Enregistrement…" : "Confirmer"}
            </Button>
            <Button className="min-h-11" variant="ghost" disabled={familyBusy} onClick={() => setFamilyAction(null)}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

type FicheProps = {
  backTo: string;
  student: Profile;
  enrollment: EnrollmentRow | null;
  enrollmentReady: boolean;
  former: FormerRow | null;
  classes: ClassSection[];
  years: AcademicYear[];
  classCounts: Record<string, number> | undefined;
  countsLoading: boolean;
  countsError: boolean;
  username: string;
  showTempPassword: boolean;
  tempPassword: string | null;
  accountBadge: { label: string; tone: "success" | "warning" | "default" } | null;
  parents: ParentLinkRow[];
  strip: StripRow[];
  attendanceLoading: boolean;
  windowStats: WindowStats | null;
  windowLoading: boolean;
  windowError: boolean;
  grades: GradeWithSubject[];
  gradesLoading: boolean;
  coefMap: Record<string, number>;
  termLabel: string;
  busy: boolean;
  assigning: boolean;
  savingIdentity: boolean;
  photoInteractive?: boolean;
  onResetPassword: () => Promise<boolean>;
  onRecoveryLink: () => Promise<boolean>;
  onOpenFamily: (action: "give_account" | "make_family_managed") => void;
  onExit: () => void;
  onReinstate: () => void;
  onAssignClass: (classId: string) => Promise<boolean>;
  onSaveIdentity: (gender: string, dob: string) => Promise<boolean>;
};

function EleveFiche({
  backTo,
  student,
  enrollment,
  enrollmentReady,
  former,
  classes,
  years,
  classCounts,
  countsLoading,
  countsError,
  username,
  showTempPassword,
  tempPassword,
  accountBadge,
  parents,
  strip,
  attendanceLoading,
  windowStats,
  windowLoading,
  windowError,
  grades,
  gradesLoading,
  coefMap,
  termLabel,
  busy,
  assigning,
  savingIdentity,
  photoInteractive = true,
  onResetPassword,
  onRecoveryLink,
  onOpenFamily,
  onExit,
  onReinstate,
  onAssignClass,
  onSaveIdentity,
}: FicheProps) {
  const navigate = useNavigate();
  const avatarRef = useRef<ProfileAvatarHandle>(null);
  const [tab, setTab] = useState<TabId>("apercu");
  const [showClass, setShowClass] = useState(false);
  const [draftClassId, setDraftClassId] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [editIdentity, setEditIdentity] = useState(false);
  const [identityGender, setIdentityGender] = useState("");
  const [identityDob, setIdentityDob] = useState("");

  const name = fullName(student.first_name, student.last_name);
  const className = enrollment?.classes?.name ?? null;
  const classYear = yearOf(years, enrollment?.academic_year_id);
  const canEditIdentity = !student.gender || student.gender === "other" || !student.date_of_birth;
  const age = student.date_of_birth ? ageYears(student.date_of_birth) : null;

  const termAverage = useMemo(() => {
    const periodGrades = grades.filter((grade) => grade.period_label === termLabel);
    return computeWeightedAverage(periodGrades, { coefficientBySubject: coefMap }).generalAverage;
  }, [grades, coefMap, termLabel]);
  const mention = bulletinMention(termAverage);
  const termTitle = TERM_TITLE[termLabel] ?? { full: termLabel, short: termLabel };

  useEffect(() => {
    document.getElementById(`eleve-tab-${tab}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);

  const selectTab = (next: TabId) => {
    setTab(next);
    document.getElementById(`eleve-tab-${next}`)?.focus();
  };

  const onTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next]!.id);
  };

  const latestUnjustified = strip.find((row) => row.status === "absent") ?? null;

  const messageItems: MenuItem[] = parents.flatMap((link) => {
    const parentId = link.parent_id || link.profils?.id;
    if (!parentId) return [];
    const parentName = fullName(link.profils?.first_name, link.profils?.last_name);
    const item: MenuItem = {
      id: link.id,
      label: parentName,
      hint: relationLabel(link.relationship),
      icon: <MessageSquare className="h-4 w-4" aria-hidden />,
      onSelect: () => {
        void navigate(
          `/messages?avec=${encodeURIComponent(parentId)}&retour=${encodeURIComponent(`/eleves/${student.id}`)}`,
        );
      },
    };
    return [item];
  });

  const menuItems: MenuItem[] = [];
  if (!student.family_managed) {
    menuItems.push({
      id: "password",
      label: "Nouveau mot de passe…",
      hint: "Demande confirmation, affiche le mot de passe une fois",
      icon: <KeyRound className="h-4 w-4" aria-hidden />,
      disabled: busy,
      onSelect: () => setConfirmReset(true),
    });
    menuItems.push({
      id: "recovery",
      label: "Copier un lien de réinitialisation",
      hint: "À envoyer à l'élève",
      icon: <Link2 className="h-4 w-4" aria-hidden />,
      disabled: busy,
      onSelect: () => void onRecoveryLink(),
    });
    menuItems.push({
      id: "family",
      label: "Passer en compte famille…",
      hint: "Le parent devient le seul accès",
      icon: <UserX className="h-4 w-4" aria-hidden />,
      onSelect: () => onOpenFamily("make_family_managed"),
    });
  } else {
    menuItems.push({
      id: "give",
      label: "Donner un compte à l'élève…",
      hint: "Crée un identifiant et un mot de passe temporaire",
      icon: <UserCheck className="h-4 w-4" aria-hidden />,
      onSelect: () => onOpenFamily("give_account"),
    });
  }
  if (photoInteractive && student.avatar_url) {
    menuItems.push({
      id: "photo",
      label: "Retirer la photo",
      icon: <UserX className="h-4 w-4" aria-hidden />,
      onSelect: () => avatarRef.current?.remove(),
    });
  }
  if (enrollment) {
    menuItems.push({
      id: "exit",
      label: "Sortie de l'élève…",
      hint: "Retire l'élève des listes · notes conservées",
      icon: <LogOut className="h-4 w-4" aria-hidden />,
      danger: true,
      separatorBefore: true,
      onSelect: onExit,
    });
  }

  const classActionLabel = !enrollmentReady
    ? "Classe"
    : enrollment
      ? "Changer de classe"
      : former
        ? "Réintégrer"
        : "Inscrire en classe";

  const openClassAction = () => {
    if (former && !enrollment) {
      onReinstate();
      return;
    }
    setDraftClassId("");
    setShowClass(true);
  };

  const summaryBits: string[] = [];
  if (student.date_of_birth) {
    const born = format(new Date(student.date_of_birth), "d MMMM yyyy", { locale: fr });
    summaryBits.push(`${bornWord(student.gender)} ${born}${age != null ? ` (${age} ans)` : ""}`);
  }
  if (student.gender && GENDER_LABEL[student.gender]) summaryBits.push(GENDER_LABEL[student.gender]);
  if (student.last_login_at) {
    summaryBits.push(
      `dernière connexion ${format(new Date(student.last_login_at), "d MMM 'à' HH:mm", { locale: fr })}`,
    );
  }
  const mobileBits = [
    student.matricule ? `Matricule ${student.matricule}` : null,
    age != null ? `${age} ans` : null,
    student.gender ? GENDER_LABEL[student.gender] ?? null : null,
  ].filter((bit): bit is string => !!bit);

  const accountText = student.family_managed
    ? "Compte famille"
    : accountBadge?.label === "Mot de passe modifié"
      ? "Compte élève · mot de passe changé"
      : accountBadge?.tone === "warning"
        ? "Compte élève · mot de passe à changer"
        : "Compte élève · jamais connecté";

  const draftTarget =
    draftClassId && draftClassId !== enrollment?.class_section_id
      ? classes.find((item) => item.id === draftClassId) ?? null
      : null;
  const countsReady = countsError || classCounts !== undefined;
  const currentHeadcount = draftTarget ? Number(classCounts?.[draftTarget.id] ?? 0) : 0;
  const headcountAfter =
    draftTarget && enrollment?.class_section_id === draftTarget.id
      ? currentHeadcount
      : currentHeadcount + 1;
  const capacity =
    draftTarget && typeof draftTarget.capacity === "number" && draftTarget.capacity > 0
      ? draftTarget.capacity
      : null;
  const targetYear = draftTarget ? yearOf(years, draftTarget.academic_year_id) : null;

  return (
    <div>
      <BackLink to={backTo} label="Retour aux élèves" className="min-h-11" />

      {enrollmentReady && !enrollment && former ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">
            Cet élève est sorti de l'école
            {former.left_at ? ` le ${format(new Date(former.left_at), "d MMMM yyyy", { locale: fr })}` : ""}
            {" · "}
            {exitReasonLabel(former.exit_reason)}
          </p>
          {former.exit_note ? <p className="mt-1 text-amber-900">{former.exit_note}</p> : null}
          <p className="mt-1 text-amber-800">
            Ses notes, ses présences et son parcours sont conservés. Il n'apparaît plus dans les listes de classe.
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 gap-4">
            <ProfileAvatar
              ref={avatarRef}
              layout="badge"
              interactive={photoInteractive}
              userId={student.id}
              avatarUrl={student.avatar_url}
              name={name}
              editable
              size="lg"
              circleClassName="h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl"
              invalidateKeys={[
                ["eleve-detail", student.id],
                ["eleves"],
              ]}
            />
            <div className="min-w-0">
              <h1 className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{name}</h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {className ? (
                  <Chip tone="class">{classYear ? `${className} · ${classYear}` : className}</Chip>
                ) : enrollmentReady && former?.classes?.name ? (
                  <Chip tone="warn">Dernière classe : {former.classes.name}</Chip>
                ) : enrollmentReady ? (
                  <Chip tone="warn">Sans classe</Chip>
                ) : (
                  <span className="inline-block h-6 w-24 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
                )}
                {student.matricule ? (
                  <Chip className="hidden sm:inline-flex">Matricule {student.matricule}</Chip>
                ) : null}
                {enrollmentReady && enrollment ? (
                  <Chip tone="ok">{enrolledWord(student.gender)}</Chip>
                ) : enrollmentReady && former ? (
                  <Chip tone="warn">{formerWord(student.gender)}</Chip>
                ) : null}
                <Chip className="hidden md:inline-flex">{accountText}</Chip>
              </div>
              {summaryBits.length > 0 ? (
                <p className="mt-2 hidden text-sm text-slate-600 sm:block">{summaryBits.join(" · ")}</p>
              ) : null}
              {mobileBits.length > 0 ? (
                <p className="mt-2 text-sm text-slate-600 sm:hidden">{mobileBits.join(" · ")}</p>
              ) : null}
            </div>
          </div>

          <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
            <ActionMenu
              label="Message aux parents"
              shortLabel="Parents"
              icon={<MessageSquare className="h-4 w-4" aria-hidden />}
              variant="primary"
              items={messageItems}
              emptyLabel="Aucun parent lié"
            />
            <Button
              className="min-h-11 min-w-11 flex-1 sm:flex-none"
              variant="outline"
              disabled={!enrollmentReady}
              aria-haspopup="dialog"
              aria-expanded={showClass}
              aria-label={classActionLabel}
              onClick={openClassAction}
            >
              {former && !enrollment ? (
                <Undo2 className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowLeftRight className="h-4 w-4" aria-hidden />
              )}
              <span className="md:hidden">{former && !enrollment ? "Réintégrer" : "Classe"}</span>
              <span className="hidden md:inline">{classActionLabel}</span>
            </Button>
            <ActionMenu
              label="Plus d'actions"
              shortLabel="Plus"
              icon={<MoreHorizontal className="h-4 w-4 md:hidden" aria-hidden />}
              variant="outline"
              items={menuItems}
              forceMenu
              busy={busy}
              trailing={<ChevronDown className="hidden h-4 w-4 md:inline" aria-hidden />}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Présence · 30 jours"
            shortLabel="Présence 30 j"
            value={
              windowLoading ? "…" : windowError || !windowStats || windowStats.rate === null ? "—" : formatPct(windowStats.rate)
            }
            hint={
              windowLoading
                ? "Calcul…"
                : windowError
                  ? "Indisponible"
                  : !windowStats || windowStats.rate === null
                    ? "Aucun cours"
                    : windowStats.classRate === null
                      ? "sur 30 jours"
                      : rateCompare(windowStats.rate, windowStats.classRate).text
            }
            hintClass={
              windowStats && windowStats.rate !== null && windowStats.classRate !== null
                ? rateCompare(windowStats.rate, windowStats.classRate).className
                : "text-slate-600"
            }
          />
          <StatTile
            label="Absences · 30 jours"
            shortLabel="Absences 30 j"
            value={windowLoading ? "…" : windowError || !windowStats ? "—" : String(windowStats.absences)}
            hint={
              windowLoading
                ? "Calcul…"
                : windowError || !windowStats
                  ? "Indisponible"
                  : absenceHint(windowStats.unjustified, windowStats.absences)
            }
            hintClass={
              windowStats && windowStats.unjustified > 0 ? "text-amber-800" : "text-slate-600"
            }
          />
          <StatTile
            label="Retards · 30 jours"
            shortLabel="Retards 30 j"
            value={windowLoading ? "…" : windowError || !windowStats ? "—" : String(windowStats.lates)}
            hint={
              windowLoading
                ? "Calcul…"
                : windowError || !windowStats
                  ? "Indisponible"
                  : lateHint(windowStats.lates, windowStats.latestLate)
            }
            hintClass="text-slate-600"
          />
          <StatTile
            label={`Moyenne · ${termTitle.full}`}
            shortLabel={`Moyenne ${termTitle.short}`}
            value={
              gradesLoading ? (
                "…"
              ) : termAverage === null ? (
                "—"
              ) : (
                <>
                  {formatScore(termAverage)}
                  <span className="text-sm font-semibold text-slate-600"> / 20</span>
                </>
              )
            }
            hint={
              gradesLoading ? "Calcul…" : termAverage === null ? "Pas encore de notes" : `${termAverage >= 10 ? "✓ " : ""}${mention}`
            }
            hintClass={termAverage === null ? "text-slate-600" : termAverage >= 10 ? "text-emerald-800" : "text-amber-800"}
          />
        </div>
      </Card>

      <div
        role="tablist"
        aria-label="Sections de la fiche"
        aria-orientation="horizontal"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200"
        onKeyDown={onTabKey}
      >
        {TABS.map((item) => {
          const selected = tab === item.id;
          const label =
            item.id === "famille" && parents.length > 0 ? `${item.label} (${parents.length})` : item.label;
          const short =
            item.id === "famille" && parents.length > 0 ? `${item.short} (${parents.length})` : item.short;
          return (
            <button
              key={item.id}
              id={`eleve-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`eleve-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.id)}
              className={cn(
                "min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
                selected ? "border-brand-700 text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900",
              )}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`eleve-panel-${tab}`}
        aria-labelledby={`eleve-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {tab === "apercu" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">Identité</h2>
                  {canEditIdentity ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                      onClick={() => setEditIdentity((open) => !open)}
                    >
                      {editIdentity ? "Fermer" : "Modifier"}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <IdentityValue
                    label="Date de naissance"
                    value={
                      student.date_of_birth
                        ? format(new Date(student.date_of_birth), "d MMMM yyyy", { locale: fr })
                        : null
                    }
                    onAdd={canEditIdentity && !student.date_of_birth ? () => setEditIdentity(true) : undefined}
                  />
                  <IdentityValue
                    label="Sexe"
                    value={student.gender ? GENDER_LABEL[student.gender] ?? student.gender : null}
                    onAdd={
                      canEditIdentity && (!student.gender || student.gender === "other")
                        ? () => setEditIdentity(true)
                        : undefined
                    }
                  />
                  <IdentityValue label="Téléphone" value={student.phone} />
                  <IdentityValue label="Adresse" value={student.address} />
                  <IdentityValue label="Matricule" value={student.matricule} />
                  <IdentityValue label="Identifiant" value={username === "—" ? null : username} />
                </div>
                {editIdentity && canEditIdentity ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-3">
                    <div>
                      <Label>Sexe</Label>
                      <Select value={identityGender} onChange={(event) => setIdentityGender(event.target.value)}>
                        <option value="">
                          {student.gender === "M" || student.gender === "F" ? "Inchangé" : "Choisir…"}
                        </option>
                        <option value="M">Masculin</option>
                        <option value="F">Féminin</option>
                      </Select>
                    </div>
                    <div>
                      <Label>Date de naissance</Label>
                      <DateInputFr
                        value={identityDob}
                        onChange={setIdentityDob}
                        minYear={new Date().getFullYear() - 35}
                        maxYear={new Date().getFullYear() - 3}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-11"
                        disabled={savingIdentity}
                        onClick={() =>
                          void onSaveIdentity(identityGender, identityDob).then((ok) => {
                            if (!ok) return;
                            setEditIdentity(false);
                            setIdentityGender("");
                            setIdentityDob("");
                          })
                        }
                      >
                        {savingIdentity ? "Enregistrement…" : "Enregistrer"}
                      </Button>
                      <Button className="min-h-11" variant="ghost" onClick={() => setEditIdentity(false)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
              <AttendanceStripCard
                rows={strip}
                loading={attendanceLoading}
                latest={latestUnjustified}
                gender={student.gender}
                studentId={student.id}
                onSeeAll={() => setTab("presences")}
              />
            </div>
            <FamilyCard
              parents={parents}
              onMessage={(parentId) =>
                navigate(
                  `/messages?avec=${encodeURIComponent(parentId)}&retour=${encodeURIComponent(`/eleves/${student.id}`)}`,
                )
              }
            />
          </div>
        ) : null}

        {tab === "notes" ? (
          <Card>
            <h2 className="font-semibold text-slate-900">Notes</h2>
            {gradesLoading ? (
              <p className="mt-3 text-sm text-slate-600">Chargement…</p>
            ) : grades.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Aucune note enregistrée pour le moment.</p>
            ) : (
              <div className="mt-4">
                <NotesPeriodTables grades={grades} coefficientBySubject={coefMap} showEvaluation />
              </div>
            )}
          </Card>
        ) : null}

        {tab === "presences" ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Présences récentes</h2>
              <Link
                to={`/presences-ecole?eleve=${encodeURIComponent(student.id)}&statut=absent`}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                Absences à justifier
              </Link>
            </div>
            {attendanceLoading ? (
              <p className="mt-3 text-sm text-slate-600">Chargement…</p>
            ) : strip.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Aucune présence enregistrée.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {strip.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-800">
                      {format(new Date(row.date), "d MMM yyyy", { locale: fr })}
                      {row.subject ? ` · ${row.subject}` : ""}
                      {row.note ? <span className="mt-0.5 block text-xs text-slate-600">{row.note}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
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
                      {row.status === "absent" ? (
                        <Link
                          to={justifyHref(student.id, row.date)}
                          className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                        >
                          Justifier
                        </Link>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {tab === "compte" ? (
          <Card>
            <h2 className="font-semibold text-slate-900">Compte & accès</h2>
            {student.family_managed ? (
              <div className="mt-3 space-y-3 text-sm">
                <Badge tone="info">Compte famille</Badge>
                <p className="text-slate-600">
                  Cet élève n'a pas de connexion : c'est le parent qui suit son enfant avec son propre compte.
                </p>
                {parents.length === 0 ? (
                  <p className="text-amber-800">
                    Aucun parent lié : personne ne peut voir cet élève. Créez le parent dans la page Parents.
                  </p>
                ) : null}
                <p className="text-sm text-slate-600">
                  Pour donner un compte à l'élève, ouvrez le menu Plus.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-600">Identifiant</span>
                  <Badge>{username}</Badge>
                </div>
                {showTempPassword && tempPassword ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-600">Mot de passe temporaire</span>
                    <Badge tone="warning">{tempPassword}</Badge>
                  </div>
                ) : (
                  <p className="text-slate-600">Mot de passe temporaire non affiché</p>
                )}
                {accountBadge ? <Badge tone={accountBadge.tone}>{accountBadge.label}</Badge> : null}
                {student.last_login_at ? (
                  <p className="text-sm text-slate-600">
                    Dernière connexion :{" "}
                    {format(new Date(student.last_login_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">Jamais connecté</p>
                )}
                <p className="pt-1 text-sm text-slate-600">
                  Le mot de passe, le lien de réinitialisation et le compte famille sont dans le menu Plus.
                </p>
              </div>
            )}
          </Card>
        ) : null}

        {tab === "famille" ? (
          <FamilyCard
            parents={parents}
            detailed
            onMessage={(parentId) =>
              navigate(
                `/messages?avec=${encodeURIComponent(parentId)}&retour=${encodeURIComponent(`/eleves/${student.id}`)}`,
              )
            }
          />
        ) : null}

        {tab === "parcours" ? <ParcoursCard studentId={student.id} /> : null}
      </div>

      <Modal
        open={showClass}
        title={enrollment ? "Changer de classe" : "Inscrire en classe"}
        onClose={() => {
          if (!assigning) setShowClass(false);
        }}
        closeDisabled={assigning}
      >
        <div className="space-y-4 text-sm text-slate-700">
          {classes.length === 0 ? (
            <p className="text-amber-800">Créez d’abord une classe dans Classes.</p>
          ) : (
            <div>
              <Label htmlFor="fiche-classe">Classe</Label>
              <Select
                id="fiche-classe"
                autoFocus
                value={draftClassId || enrollment?.class_section_id || ""}
                onChange={(event) => setDraftClassId(event.target.value)}
              >
                <option value="">{classes.length ? "Choisir une classe…" : "Aucune classe"}</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {draftTarget ? (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-3 text-slate-800">
              <p>
                {enrollment && className ? (
                  <>
                    Passer <strong>{student.first_name}</strong> de <strong>{className}</strong> à{" "}
                    <strong>{draftTarget.name}</strong>
                    {targetYear ? (
                      <>
                        {" "}
                        pour <strong>{targetYear}</strong>
                      </>
                    ) : null}{" "}
                    ?
                  </>
                ) : (
                  <>
                    Inscrire <strong>{student.first_name}</strong> en <strong>{draftTarget.name}</strong>
                    {targetYear ? (
                      <>
                        {" "}
                        pour <strong>{targetYear}</strong>
                      </>
                    ) : null}{" "}
                    ?
                  </>
                )}
              </p>
              {countsLoading && !countsReady ? (
                <p className="mt-2 text-slate-600">Calcul de l'effectif…</p>
              ) : countsError ? (
                <p className="mt-2 text-slate-600">
                  Effectif indisponible pour le moment. Le changement reste possible.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-slate-600">
                    Effectif de {draftTarget.name} après le changement :{" "}
                    <strong className="text-slate-800">
                      {headcountAfter}
                      {capacity ? ` / ${capacity}` : ""}
                    </strong>
                    {capacity ? null : ". La capacité de cette classe n'est pas renseignée."}
                  </p>
                  {capacity ? (
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={capacity}
                      aria-valuenow={Math.min(headcountAfter, capacity)}
                      aria-label={`Effectif de ${draftTarget.name}`}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full",
                          headcountAfter > capacity ? "bg-amber-500" : "bg-brand-700",
                        )}
                        style={{ width: `${Math.min(100, (headcountAfter / capacity) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                  {capacity && headcountAfter > capacity ? (
                    <p className="mt-2 font-semibold text-amber-800">
                      Ce changement dépasse la capacité ({capacity}).
                    </p>
                  ) : null}
                </>
              )}
              <p className="mt-2 text-slate-600">
                {className
                  ? `Ses notes et présences de ${className} restent dans son parcours.`
                  : "Les notes et présences déjà enregistrées restent dans son parcours."}
              </p>
            </div>
          ) : (
            <p className="text-slate-600">
              {enrollment ? "Choisissez la nouvelle classe. Rien n'est modifié avant confirmation." : "Choisissez une classe. Rien n'est enregistré avant confirmation."}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={!draftTarget || assigning || (!countsReady && countsLoading)}
              onClick={() =>
                void onAssignClass(draftClassId).then((ok) => {
                  if (!ok) return;
                  setShowClass(false);
                  setDraftClassId("");
                })
              }
            >
              {assigning ? "Enregistrement…" : enrollment ? "Confirmer le changement" : "Confirmer l'inscription"}
            </Button>
            <Button className="min-h-11" variant="ghost" disabled={assigning} onClick={() => setShowClass(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmReset}
        title="Nouveau mot de passe"
        onClose={() => {
          if (!busy) setConfirmReset(false);
        }}
        closeDisabled={busy}
      >
        <div className="space-y-4 text-sm text-slate-700">
          <p>
            Un nouveau mot de passe temporaire va remplacer celui de <strong>{student.first_name}</strong>. L'ancien
            ne fonctionnera plus. Le nouveau s'affichera une seule fois, pour que vous puissiez le transmettre.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() =>
                void onResetPassword().then((ok) => {
                  if (ok) setConfirmReset(false);
                })
              }
            >
              {busy ? "Enregistrement…" : "Confirmer"}
            </Button>
            <Button className="min-h-11" variant="ghost" disabled={busy} autoFocus onClick={() => setConfirmReset(false)}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function rateCompare(studentRate: number, classRate: number): { text: string; className: string } {
  const studentRounded = Math.round(studentRate * 10) / 10;
  const classRounded = Math.round(classRate * 10) / 10;
  const shown = formatPct(classRate);
  if (studentRounded === classRounded) {
    return { text: `au niveau de la classe (${shown})`, className: "text-slate-600" };
  }
  if (studentRounded > classRounded) {
    return { text: `▲ au-dessus de la classe (${shown})`, className: "text-emerald-800" };
  }
  return { text: `▼ en dessous de la classe (${shown})`, className: "text-amber-800" };
}

function absenceHint(unjustified: number, total: number): string {
  if (total === 0) return "aucune";
  if (unjustified === 0) return "toutes justifiées";
  return `dont ${unjustified} non justifiée${unjustified > 1 ? "s" : ""}`;
}

function lateHint(lates: number, latest: { date: string; subject: string | null } | null): string {
  if (lates === 0) return "aucun";
  if (!latest) return "sur 30 jours";
  const when = format(new Date(latest.date), "d MMM", { locale: fr });
  return latest.subject ? `${when} · ${latest.subject}` : when;
}

function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "class" | "ok" | "warn";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "class" && "bg-brand-100 text-brand-800",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
        tone === "warn" && "bg-amber-100 text-amber-900",
        className,
      )}
    >
      {children}
    </span>
  );
}

function StatTile({
  label,
  shortLabel,
  value,
  hint,
  hintClass,
}: {
  label: string;
  shortLabel: string;
  value: ReactNode;
  hint: string;
  hintClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 px-3 py-3">
      <p className="text-xs font-medium text-slate-600">
        <span className="lg:hidden">{shortLabel}</span>
        <span className="hidden lg:inline">{label}</span>
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className={cn("mt-1 text-xs font-semibold", hintClass)}>{hint}</p>
    </div>
  );
}

function IdentityValue({
  label,
  value,
  onAdd,
}: {
  label: string;
  value?: string | null;
  onAdd?: () => void;
}) {
  const filled = value?.trim() ? value.trim() : null;
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      {filled ? (
        <span className="mt-0.5 block text-sm font-medium text-slate-900">{filled}</span>
      ) : onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-0.5 inline-flex min-h-11 items-center text-left text-sm font-semibold text-amber-800 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Non renseigné · Ajouter
        </button>
      ) : (
        <span className="mt-0.5 block text-sm font-semibold text-amber-800">Non renseigné</span>
      )}
    </div>
  );
}

function AttendanceStripCard({
  rows,
  loading,
  latest,
  gender,
  studentId,
  onSeeAll,
}: {
  rows: StripRow[];
  loading: boolean;
  latest: StripRow | null;
  gender: string | null | undefined;
  studentId: string;
  onSeeAll: () => void;
}) {
  const summary = rows
    .map((row) => {
      const when = format(new Date(row.date), "d MMM", { locale: fr });
      return `${when}${row.subject ? ` ${row.subject}` : ""} ${ATTENDANCE_LABEL[row.status] ?? row.status}`;
    })
    .join(", ");

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Présences · 15 derniers cours</h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          Tout voir
        </button>
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Aucune présence enregistrée.</p>
      ) : (
        <>
          <div
            className="mt-3 flex gap-0.5 sm:gap-1"
            role="img"
            aria-label={`${rows.length} derniers cours, le plus récent à gauche : ${summary}`}
          >
            {rows.map((row) => (
              <span
                key={row.id}
                title={`${format(new Date(row.date), "d MMM yyyy", { locale: fr })}${row.subject ? ` · ${row.subject}` : ""} · ${ATTENDANCE_LABEL[row.status] ?? row.status}`}
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center justify-center rounded-md text-[11px] font-bold sm:h-8 sm:w-7 sm:max-w-7 sm:flex-none sm:text-xs",
                  STRIP_CLASS[row.status],
                )}
              >
                {STRIP_LETTER[row.status]}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">
            P présent · A absent · R retard · J justifié — le plus récent à gauche
          </p>
          {latest ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-1 text-sm text-red-800">
              <p>
                <strong>{absentWord(gender)}</strong>{" "}
                {format(new Date(latest.date), "EEE d MMM", { locale: fr })}
                {latest.subject ? ` · ${latest.subject}` : ""} · {gender === "M" ? "non justifié" : "non justifiée"}
              </p>
              <Link
                to={justifyHref(studentId, latest.date)}
                className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                Justifier
              </Link>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function FamilyCard({
  parents,
  detailed = false,
  onMessage,
}: {
  parents: ParentLinkRow[];
  detailed?: boolean;
  onMessage: (parentId: string) => void;
}) {
  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Famille</h2>
      {parents.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          Aucun parent lié à cet élève.
          {detailed ? " Créez le parent dans la page Parents." : null}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {parents.map((link) => {
            const parentId = link.parent_id || link.profils?.id;
            const parentName = fullName(link.profils?.first_name, link.profils?.last_name);
            const phone = link.profils?.phone?.trim() || "";
            const tel = phone ? telHref(phone) : null;
            const email =
              link.profils?.email && !link.profils.email.endsWith("@edufaso.local") ? link.profils.email : null;
            const initials = parentName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? "")
              .join("");
            return (
              <li
                key={link.id}
                className="rounded-xl border border-slate-200 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-faso-yellow text-sm font-bold text-white">
                    {initials || "P"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{parentName}</p>
                    <p className="text-sm text-slate-600">
                      {relationLabel(link.relationship)}
                      {phone ? ` · ${phone}` : ""}
                    </p>
                    {detailed && email ? <p className="text-sm text-slate-600">{email}</p> : null}
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    {tel ? (
                      <a
                        href={tel}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:flex-none"
                      >
                        <Phone className="h-4 w-4" aria-hidden />
                        Appeler
                      </a>
                    ) : null}
                    {parentId ? (
                      <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => onMessage(parentId)}>
                        <MessageSquare className="h-4 w-4" aria-hidden />
                        Message
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ActionMenu({
  label,
  shortLabel,
  icon,
  trailing,
  variant,
  items,
  emptyLabel,
  forceMenu = false,
  busy = false,
}: {
  label: string;
  shortLabel: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  variant: "primary" | "outline";
  items: MenuItem[];
  emptyLabel?: string;
  forceMenu?: boolean;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const buttonId = useId();
  const single = !forceMenu && items.length <= 1;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    const focusId = window.setTimeout(() => {
      rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    }, 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.clearTimeout(focusId);
    };
  }, [open]);

  const close = (focusBack: boolean) => {
    setOpen(false);
    if (focusBack) buttonRef.current?.focus();
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nodes[(index < 0 ? 0 : index + 1) % nodes.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nodes[(index <= 0 ? nodes.length : index) - 1]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  if (single) {
    const only = items[0];
    return (
      <Button
        className="min-h-11 min-w-11 flex-1 sm:flex-none"
        variant={variant}
        disabled={!only || only.disabled}
        aria-label={label}
        title={!only ? emptyLabel : undefined}
        onClick={() => only?.onSelect()}
      >
        {icon}
        <span className="md:hidden">{shortLabel}</span>
        <span className="hidden md:inline">{label}</span>
      </Button>
    );
  }

  return (
    <div ref={rootRef} className="relative min-w-11 flex-1 sm:flex-none">
      <Button
        ref={buttonRef}
        id={buttonId}
        className="min-h-11 w-full"
        variant={variant}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy && items.every((item) => item.disabled)}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon}
        {forceMenu ? (
          <span className="hidden md:inline">{shortLabel}</span>
        ) : (
          <>
            <span className="md:hidden">{shortLabel}</span>
            <span className="hidden md:inline">{label}</span>
          </>
        )}
        {trailing}
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          className="absolute right-0 z-40 mt-1 max-h-[min(24rem,70vh)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          onKeyDown={onMenuKey}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separatorBefore ? <div role="separator" className="my-1 border-t border-slate-200" /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-700 disabled:opacity-50",
                  item.danger
                    ? "bg-red-50 font-semibold text-red-800 hover:bg-red-100"
                    : "text-slate-800 hover:bg-slate-100",
                )}
              >
                <span className="flex items-center gap-2 text-sm">
                  {item.icon}
                  {item.label}
                </span>
                {item.hint ? (
                  <span className={cn("pl-6 text-xs font-normal", item.danger ? "text-red-800" : "text-slate-600")}>
                    {item.hint}
                  </span>
                ) : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse motion-reduce:animate-none">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex gap-3">
          <div className="h-16 w-16 rounded-full bg-slate-200 sm:h-20 sm:w-20" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-48 max-w-full rounded bg-slate-200" />
            <div className="h-4 w-64 max-w-full rounded bg-slate-100" />
            <div className="h-4 w-40 max-w-full rounded bg-slate-100" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
      <p className="sr-only">Chargement de la fiche élève</p>
    </div>
  );
}
