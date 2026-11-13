import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { buildBulletinPdf } from "@/lib/bulletinData";
import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { useGradingPeriodState } from "@/hooks/useGradingPeriodState";
import type { Profile, School } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { EmptyState, PageHeader, PageLoadingState } from "@/components/ui";
import { BulletinView } from "@/components/BulletinView";
import {
  childDisplayName,
  useChildEnrollment,
  useParentChildLink,
  useParentChildParams,
} from "@/pages/parent/parentChildAccess";
import {
  ParentChildBackLink,
  ParentChildGate,
} from "@/pages/parent/ParentChildGate";

const BULLETIN_PERIODS = [...TRIMESTER_PERIODS, ANNUAL_PERIOD_LABEL] as const;

export default function EnfantBulletin() {
  const id = useParentChildParams();
  const { schools, schoolId } = useAuth();
  const school = schools.find((s) => s.id === schoolId);

  const { data: link, isLoading: linkLoading } = useParentChildLink(id);
  const child = link?.profils;
  const childName = childDisplayName(child);

  const { data: enrollment, isLoading: enrollLoading } = useChildEnrollment(
    id,
    !!link,
  );

  const { data: periods = [] } = useQuery({
    queryKey: ["enfant-periodes-notes", id],
    enabled: !!id && !!link,
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("period_label")
        .eq("student_id", id!);
      const set = new Set(
        (data ?? []).map((r) => r.period_label as string).filter(Boolean),
      );
      for (const d of TRIMESTER_PERIODS) set.add(d);
      set.add(ANNUAL_PERIOD_LABEL);
      return [
        ...TRIMESTER_PERIODS.filter((p) => set.has(p)),
        ANNUAL_PERIOD_LABEL,
        ...[...set].filter(
          (p) =>
            !(TRIMESTER_PERIODS as readonly string[]).includes(p) &&
            p !== ANNUAL_PERIOD_LABEL,
        ),
      ];
    },
  });

  const periodLabels = periods.length > 0 ? periods : BULLETIN_PERIODS;
  const { period, selectPeriod, closedLabels } = useGradingPeriodState(
    periodLabels,
    { classSectionId: enrollment?.class_section_id, schoolId },
  );

  /** Official PDF (registers the QR code) — only on download / share. */
  const buildPdf = async () => {
    if (!id || !child || !school || !enrollment?.class_section_id) {
      throw new Error("Profil, classe ou école introuvable");
    }
    const coefficientBySubject: Record<string, number> = {};
    const { data: programme } = await supabase
      .from("programme_classe")
      .select("subject_id, coefficient")
      .eq("class_section_id", enrollment.class_section_id);
    for (const row of programme ?? []) {
      coefficientBySubject[row.subject_id as string] = Number(row.coefficient);
    }

    // the link query selects the whole profile row: pass birth date / gender when present
    const extra = child as typeof child & {
      date_of_birth?: string | null;
      gender?: string | null;
      avatar_url?: string | null;
    };
    const studentProfile = {
      id: child.id,
      first_name: child.first_name,
      last_name: child.last_name,
      email: child.email ?? null,
      phone: null,
      avatar_url: extra.avatar_url ?? null,
      date_of_birth: extra.date_of_birth ?? null,
      gender: extra.gender ?? null,
      matricule: child.matricule ?? null,
      must_change_password: false,
      active: true,
      created_at: "",
    } as Profile;

    return buildBulletinPdf({
      school: school as School,
      student: studentProfile,
      classSectionId: enrollment.class_section_id,
      className: enrollment.classes?.name ?? "—",
      periodLabel: period,
      coefficientBySubject,
    });
  };

  const filePeriod =
    period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");

  const isLoading = linkLoading || enrollLoading;

  return (
    <ParentChildGate link={link} isLoading={linkLoading}>
      <div>
        <ParentChildBackLink childName={childName} />
        <PageHeader
          title={childName ? `Bulletin — ${childName}` : "Bulletin"}
          subtitle={
            enrollment?.classes?.name
              ? `${enrollment.classes.name} · ${period}`
              : "Moyennes, rang et bulletin PDF"
          }
        />

        {isLoading ? (
          <PageLoadingState message="Chargement du bulletin…" />
        ) : !enrollment || !id ? (
          <EmptyState message="Cet élève n’est pas encore inscrit dans une classe." />
        ) : (
          <div className="max-w-2xl">
            <BulletinView
              studentId={id}
              classSectionId={enrollment.class_section_id}
              periods={periodLabels}
              period={period}
              onPeriodChange={selectPeriod}
              closedPeriods={closedLabels}
              buildPdf={buildPdf}
              fileName={`bulletin-${child?.last_name ?? "eleve"}-${filePeriod}.pdf`}
            />
          </div>
        )}
      </div>
    </ParentChildGate>
  );
}
