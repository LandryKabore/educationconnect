import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fr } from "date-fns/locale";
import { ClipboardList, FileText } from "lucide-react";
import { ClassColorDot } from "@/components/ClassColor";
import { CLASS_COLOR_SURFACE, classColorVars } from "@/lib/classColors";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatDateSafe } from "@/lib/dateFr";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import type { EvaluationType } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type NextExam = {
  title: string;
  eval_date: string | null;
  admin_confirmed: boolean;
};

type ClassTravauxRow = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  total: number;
  ungraded: number;
  byType: Record<EvaluationType, number>;
  nextExam: NextExam | null;
  /** Subject/period of first item still to grade — so “Gérer” lands on the right filters. */
  focusSubjectId: string | null;
  focusPeriod: string | null;
};

const EMPTY_BY_TYPE: Record<EvaluationType, number> = {
  interrogation: 0,
  devoir: 0,
  composition: 0,
  examen: 0,
};

export default function MesDevoirsProf() {
  const { user } = useAuth();

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["teacher-mes-devoirs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: aff, error } = await supabase
        .from("affectations_enseignement")
        .select("class_section_id, classes(id, name, grade_level)")
        .eq("teacher_id", user!.id);
      if (error) throw error;

      const byClass = new Map<
        string,
        { classId: string; className: string; gradeLevel: string | null }
      >();
      for (const row of aff ?? []) {
        const r = row as {
          class_section_id: string;
          classes: { id: string; name: string; grade_level: string | null } | null;
        };
        const classId = r.classes?.id ?? r.class_section_id;
        if (!byClass.has(classId)) {
          byClass.set(classId, {
            classId,
            className: r.classes?.name ?? "Classe",
            gradeLevel: r.classes?.grade_level ?? null,
          });
        }
      }

      const list = [...byClass.values()];
      const sorted = sortClassesByProgression(
        list.map((c) => ({ id: c.classId, name: c.className, grade_level: c.gradeLevel })),
      );
      const ordered = sorted
        .map((s) => list.find((c) => c.classId === s.id)!)
        .filter(Boolean);

      if (ordered.length === 0) return [] as ClassTravauxRow[];
      const classIds = ordered.map((c) => c.classId);

      const { data: evals, error: evalError } = await supabase
        .from("evaluations")
        .select(
          "id, class_section_id, subject_id, period_label, type, eval_date, title, admin_confirmed, created_at",
        )
        .eq("teacher_id", user!.id)
        .in("class_section_id", classIds);
      if (evalError) throw evalError;

      const rows = (evals ?? []) as {
        id: string;
        class_section_id: string;
        subject_id: string;
        period_label: string;
        type: EvaluationType;
        eval_date: string | null;
        title: string;
        admin_confirmed: boolean;
        created_at: string;
      }[];

      const gradedCounts = new Map<string, number>();
      const evalIds = rows.map((r) => r.id);
      if (evalIds.length > 0) {
        const { data: notes } = await supabase
          .from("notes")
          .select("evaluation_id")
          .in("evaluation_id", evalIds);
        for (const n of notes ?? []) {
          const eid = (n as { evaluation_id: string | null }).evaluation_id;
          if (eid) gradedCounts.set(eid, (gradedCounts.get(eid) ?? 0) + 1);
        }
      }

      const rosterByClass = new Map<string, number>();
      const { data: insc } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .in("class_section_id", classIds)
        .eq("status", "active");
      for (const row of insc ?? []) {
        const cid = (row as { class_section_id: string }).class_section_id;
        rosterByClass.set(cid, (rosterByClass.get(cid) ?? 0) + 1);
      }

      const todayIso = new Date().toISOString().slice(0, 10);

      return ordered.map((c): ClassTravauxRow => {
        const classEvals = rows.filter((r) => r.class_section_id === c.classId);
        const byType = { ...EMPTY_BY_TYPE };
        let ungraded = 0;
        const ungradedList: typeof classEvals = [];
        const roster = rosterByClass.get(c.classId) ?? 0;
        for (const ev of classEvals) {
          byType[ev.type] += 1;
          const noted = gradedCounts.get(ev.id) ?? 0;
          // Still "à noter" until every student in the class has a grade.
          if (roster === 0 || noted < roster) {
            ungraded += 1;
            ungradedList.push(ev);
          }
        }
        // Prefer oldest ungraded so the teacher lands on work waiting longest.
        ungradedList.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const focus = ungradedList[0] ?? classEvals[0] ?? null;
        const nextExam = classEvals
          .filter((ev) => ev.type === "examen" && ev.eval_date && ev.eval_date >= todayIso)
          .sort((a, b) => (a.eval_date! < b.eval_date! ? -1 : 1))[0];

        return {
          classId: c.classId,
          className: c.className,
          gradeLevel: c.gradeLevel,
          total: classEvals.length,
          ungraded,
          byType,
          focusSubjectId: focus?.subject_id ?? null,
          focusPeriod: focus?.period_label ?? null,
          nextExam: nextExam
            ? {
                title: nextExam.title,
                eval_date: nextExam.eval_date,
                admin_confirmed: nextExam.admin_confirmed,
              }
            : null,
        };
      });
    },
  });

  return (
    <div>
      <PageHeader
        title="Devoirs & évaluations"
        subtitle="Interrogations et devoirs à rendre — par classe"
      />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour le moment." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const params = new URLSearchParams({ from: "devoirs" });
            if (c.focusSubjectId) params.set("subject", c.focusSubjectId);
            if (c.focusPeriod) params.set("period", c.focusPeriod);
            return (
              <Link
                key={c.classId}
                to={`/classes/${c.classId}/notes?${params.toString()}`}
                className="block rounded-xl outline-none ring-brand-500 focus-visible:ring-2"
              >
                <Card
                  data-class-color
                  style={classColorVars({ id: c.classId, name: c.className })}
                  className={cn(
                    "flex h-full flex-col border p-4 transition hover:brightness-[0.97] dark:hover:brightness-110",
                    CLASS_COLOR_SURFACE,
                  )}
                >
                  <div className="flex items-start gap-2">
                    <ClassColorDot id={c.classId} name={c.className} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold leading-tight">
                        {c.className}
                      </h2>
                      {c.gradeLevel ? (
                        <p className="text-xs opacity-75">{c.gradeLevel}</p>
                      ) : null}
                    </div>
                    {c.ungraded > 0 ? (
                      <Badge tone="warning">{c.ungraded} à noter</Badge>
                    ) : null}
                  </div>

                  {c.total === 0 ? (
                    <p className="mt-4 flex items-center gap-1.5 text-xs opacity-70">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Rien pour le moment
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(Object.keys(c.byType) as EvaluationType[])
                        .filter((t) => c.byType[t] > 0)
                        .map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium opacity-90 dark:bg-black/20"
                          >
                            {c.byType[t]} {evaluationTypeLabel(t).toLowerCase()}
                            {c.byType[t] > 1 ? "s" : ""}
                          </span>
                        ))}
                    </div>
                  )}

                  {c.nextExam ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium opacity-90">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {c.nextExam.title}
                        {c.nextExam.eval_date
                          ? ` · ${formatDateSafe(c.nextExam.eval_date, "d MMM", { locale: fr })}`
                          : ""}
                      </span>
                      <Badge tone={c.nextExam.admin_confirmed ? "success" : "warning"}>
                        {c.nextExam.admin_confirmed ? "Confirmé" : "En attente"}
                      </Badge>
                    </p>
                  ) : null}

                  <p className="mt-4 text-sm font-medium">Gérer →</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
