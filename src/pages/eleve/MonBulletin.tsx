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
import { EmptyState, PageLoadingState } from "@/components/ui";
import { BulletinView } from "@/components/BulletinView";
import { BulletinBanner } from "@/components/BulletinBanner";

const BULLETIN_PERIODS = [...TRIMESTER_PERIODS, ANNUAL_PERIOD_LABEL] as const;

export default function MonBulletin() {
  const { user, profile, schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);

  const { data: enrollment, isLoading } = useQuery({
    queryKey: ["mon-inscription-bulletin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as {
        class_section_id: string;
        classes: { name: string } | null;
      } | null;
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["mes-periodes-notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("period_label")
        .eq("student_id", user!.id);
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
    if (!user || !profile || !school || !enrollment?.class_section_id) {
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
    return buildBulletinPdf({
      school: school as School,
      student: profile as Profile,
      classSectionId: enrollment.class_section_id,
      className: enrollment.classes?.name ?? "—",
      periodLabel: period,
      coefficientBySubject,
    });
  };

  const filePeriod =
    period === ANNUAL_PERIOD_LABEL ? "annee" : period.replace(/\s+/g, "-");

  return (
    // squarer corners on this page only: the shared bulletin keeps its radius elsewhere
    <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
      <BulletinBanner
        studentId={user?.id}
        classSectionId={enrollment?.class_section_id}
        period={period}
        closedLabels={closedLabels}
        className={enrollment?.classes?.name}
        title="Mon bulletin"
        subtitle="Tes moyennes, ton rang et le bulletin officiel en PDF."
      />

      {isLoading ? (
        <PageLoadingState message="Chargement du bulletin…" />
      ) : !enrollment ? (
        <EmptyState message="Vous n’êtes pas encore inscrit dans une classe." />
      ) : (
        <div className="max-w-2xl">
          <BulletinView
            studentId={user!.id}
            classSectionId={enrollment.class_section_id}
            periods={periodLabels}
            period={period}
            onPeriodChange={selectPeriod}
            closedPeriods={closedLabels}
            buildPdf={buildPdf}
            fileName={`bulletin-${profile?.last_name ?? "eleve"}-${filePeriod}.pdf`}
          />
        </div>
      )}
    </div>
  );
}
