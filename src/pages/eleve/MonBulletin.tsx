import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { buildBulletinPdf } from "@/lib/bulletinData";
import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import { periodOptionLabel } from "@/lib/gradingPeriod";
import { useGradingPeriodState } from "@/hooks/useGradingPeriodState";
import type { Profile, School } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

const BULLETIN_PERIODS = [...TRIMESTER_PERIODS, ANNUAL_PERIOD_LABEL] as const;

export default function MonBulletin() {
  const { user, profile, schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const [generating, setGenerating] = useState(false);

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

  const handleGenerate = async () => {
    if (!user || !profile || !school || !enrollment?.class_section_id) {
      toast.error("Profil, classe ou école introuvable");
      return;
    }
    setGenerating(true);
    try {
      let coefficientBySubject: Record<string, number> = {};
      const { data: programme } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", enrollment.class_section_id);
      for (const row of programme ?? []) {
        coefficientBySubject[row.subject_id as string] = Number(
          row.coefficient,
        );
      }

      const doc = await buildBulletinPdf({
        school: school as School,
        student: profile as Profile,
        classSectionId: enrollment.class_section_id,
        className: enrollment.classes?.name ?? "—",
        periodLabel: period,
        coefficientBySubject,
      });

      const filePeriod =
        period === ANNUAL_PERIOD_LABEL
          ? "annee"
          : period.replace(/\s+/g, "-");
      doc.save(
        `bulletin-${profile.last_name ?? "eleve"}-${filePeriod}.pdf`,
      );
      toast.success("Bulletin téléchargé");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mon bulletin"
        subtitle="Téléchargez votre bulletin scolaire en PDF"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : !enrollment ? (
        <EmptyState message="Vous n’êtes pas encore inscrit dans une classe." />
      ) : (
        <Card className="max-w-lg space-y-4">
          <p className="text-sm text-slate-600">
            Classe :{" "}
            <span className="font-medium text-slate-900">
              {enrollment.classes?.name ?? "—"}
            </span>
          </p>
          <div>
            <Label>Période</Label>
            <Select value={period} onChange={(e) => selectPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {periodOptionLabel(
                    p === ANNUAL_PERIOD_LABEL ? "Année (moyenne annuelle)" : p,
                    closedLabels.has(p),
                  )}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              Moyennes par matière avec comparaison classe (élève / clas. /
              min / max / écart). Mention automatique selon la moyenne
              générale.
            </p>
          </div>
          <Button
            onClick={() => void handleGenerate()}
            disabled={generating || !school}
          >
            <Download className="h-4 w-4" />
            {generating ? "Génération…" : "Télécharger le bulletin PDF"}
          </Button>
        </Card>
      )}
    </div>
  );
}
