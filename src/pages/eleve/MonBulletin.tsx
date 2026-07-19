import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { generateBulletinPdf } from "@/lib/pdfBulletin";
import {
  ANNUAL_PERIOD_LABEL,
  TRIMESTER_PERIODS,
} from "@/lib/averages";
import type { GradeRow, Profile, School, Subject } from "@/lib/types";
import {
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function MonBulletin() {
  const { user, profile, schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const [period, setPeriod] = useState<string>(TRIMESTER_PERIODS[0]);
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
      // Keep trimesters first, then Année, then any custom labels.
      const ordered = [
        ...TRIMESTER_PERIODS.filter((p) => set.has(p)),
        ANNUAL_PERIOD_LABEL,
        ...[...set].filter(
          (p) =>
            !(TRIMESTER_PERIODS as readonly string[]).includes(p) &&
            p !== ANNUAL_PERIOD_LABEL,
        ),
      ];
      return ordered;
    },
  });

  const handleGenerate = async () => {
    if (!user || !profile || !school) {
      toast.error("Profil ou école introuvable");
      return;
    }
    setGenerating(true);
    try {
      const { data: allGradesRaw } = await supabase
        .from("notes")
        .select("*, matieres(*)")
        .eq("student_id", user.id)
        .in("period_label", [...TRIMESTER_PERIODS]);

      const allGrades = (
        (allGradesRaw ?? []) as (GradeRow & { matieres: Subject })[]
      ).map((g) => ({
        ...g,
        subject: g.matieres,
      }));

      const grades =
        period === ANNUAL_PERIOD_LABEL
          ? []
          : allGrades.filter((g) => g.period_label === period);

      let coefficientBySubject: Record<string, number> = {};
      if (enrollment?.class_section_id) {
        const { data: programme } = await supabase
          .from("programme_classe")
          .select("subject_id, coefficient")
          .eq("class_section_id", enrollment.class_section_id);
        for (const row of programme ?? []) {
          coefficientBySubject[row.subject_id as string] = Number(
            row.coefficient,
          );
        }
      }

      if (period !== ANNUAL_PERIOD_LABEL && !grades.length) {
        toast.message("Aucune note pour cette période");
        return;
      }
      if (period === ANNUAL_PERIOD_LABEL && !allGrades.length) {
        toast.message("Aucune note sur l’année");
        return;
      }

      const doc = generateBulletinPdf({
        school: school as School,
        student: profile as Profile,
        className: enrollment?.classes?.name ?? "—",
        periodLabel: period,
        coefficientBySubject,
        grades,
        allGrades,
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
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p === ANNUAL_PERIOD_LABEL
                    ? "Année (moyenne annuelle)"
                    : p}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              Moyenne annuelle = (T1 + T2 + T3) / 3. Admission à partir de
              10 / 20.
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
