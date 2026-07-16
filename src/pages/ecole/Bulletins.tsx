import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { generateBulletinPdf } from "@/lib/pdfBulletin";
import type { ClassSection, GradeRow, Profile, School, Subject } from "@/lib/types";
import { fullName } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function Bulletins() {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId);
  const [studentId, setStudentId] = useState("");
  const [period, setPeriod] = useState("Trimestre 1");
  const [generating, setGenerating] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["eleves", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("profils(*)")
        .eq("school_id", schoolId!)
        .eq("role", "student");
      return (roles ?? []).map((r) => (r as unknown as { profils: Profile }).profils);
    },
  });

  const handleGenerate = async () => {
    if (!studentId || !school) {
      toast.error("Sélectionnez un élève");
      return;
    }
    setGenerating(true);

    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const { data: enrollment } = await supabase
      .from("inscriptions")
      .select("*, classes(name)")
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();

    const classSectionId = (enrollment as { class_section_id?: string } | null)
      ?.class_section_id;

    const { data: grades } = await supabase
      .from("notes")
      .select("*, matieres(*)")
      .eq("student_id", studentId)
      .eq("period_label", period);

    let coefficientBySubject: Record<string, number> = {};
    if (classSectionId) {
      const { data: programme } = await supabase
        .from("programme_classe")
        .select("subject_id, coefficient")
        .eq("class_section_id", classSectionId);
      for (const row of programme ?? []) {
        coefficientBySubject[row.subject_id as string] = Number(row.coefficient);
      }
    }

    const className =
      (enrollment as { classes?: { name: string } } | null)?.classes?.name ?? "—";

    const doc = generateBulletinPdf({
      school: school as School,
      student,
      className,
      periodLabel: period,
      coefficientBySubject,
      grades: ((grades ?? []) as (GradeRow & { matieres: Subject })[]).map((g) => ({
        ...g,
        subject: g.matieres,
      })),
    });

    doc.save(`bulletin-${student.last_name}-${period}.pdf`);
    toast.success("Bulletin téléchargé");
    setGenerating(false);
  };

  return (
    <div>
      <PageHeader title="Bulletins" subtitle="Génération de bulletins PDF" />

      <Card className="max-w-lg">
        {students.length === 0 ? (
          <EmptyState message="Aucun élève disponible." />
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Élève</Label>
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Choisir un élève…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s.first_name, s.last_name)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Période</Label>
              <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="Trimestre 1">Trimestre 1</option>
                <option value="Trimestre 2">Trimestre 2</option>
                <option value="Trimestre 3">Trimestre 3</option>
              </Select>
            </div>
            <Button onClick={() => void handleGenerate()} disabled={generating || !studentId}>
              <Download className="h-4 w-4" />
              {generating ? "Génération…" : "Télécharger le bulletin PDF"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
