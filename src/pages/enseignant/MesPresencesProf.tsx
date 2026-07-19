import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCircle2, ClipboardList, Users } from "lucide-react";
import { ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { formatDateSafe } from "@/lib/dateFr";
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ClassPresenceRow = {
  classId: string;
  className: string;
  gradeLevel: string | null;
  studentCount: number;
  recordedCount: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export default function MesPresencesProf() {
  const { user } = useAuth();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["teacher-mes-presences", user?.id, date],
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
          classes: {
            id: string;
            name: string;
            grade_level: string | null;
          } | null;
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
        list.map((c) => ({
          id: c.classId,
          name: c.className,
          grade_level: c.gradeLevel,
        })),
      );
      const ordered = sorted
        .map((s) => list.find((c) => c.classId === s.id)!)
        .filter(Boolean);

      if (ordered.length === 0) return [] as ClassPresenceRow[];

      const classIds = ordered.map((c) => c.classId);

      const counts = new Map<string, number>();
      const { data: insc } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .in("class_section_id", classIds)
        .eq("status", "active");
      for (const row of insc ?? []) {
        const id = (row as { class_section_id: string }).class_section_id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }

      type StatusCounts = {
        present: number;
        absent: number;
        late: number;
        excused: number;
        total: number;
      };
      const byStatus = new Map<string, StatusCounts>();
      const { data: pres } = await supabase
        .from("presences")
        .select("class_section_id, status")
        .in("class_section_id", classIds)
        .eq("date", date);
      for (const row of pres ?? []) {
        const r = row as {
          class_section_id: string;
          status: "present" | "absent" | "late" | "excused";
        };
        const cur = byStatus.get(r.class_section_id) ?? {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          total: 0,
        };
        cur[r.status] += 1;
        cur.total += 1;
        byStatus.set(r.class_section_id, cur);
      }

      return ordered.map((c): ClassPresenceRow => {
        const st = byStatus.get(c.classId);
        return {
          ...c,
          studentCount: counts.get(c.classId) ?? 0,
          recordedCount: st?.total ?? 0,
          present: st?.present ?? 0,
          absent: st?.absent ?? 0,
          late: st?.late ?? 0,
          excused: st?.excused ?? 0,
        };
      });
    },
  });

  const pending = classes.filter(
    (c) => c.studentCount > 0 && c.recordedCount < c.studentCount,
  ).length;
  const done = classes.filter(
    (c) => c.studentCount > 0 && c.recordedCount >= c.studentCount,
  ).length;

  return (
    <div>
      <PageHeader
        title="Présences"
        subtitle={`Appel du ${formatDateSafe(date, "EEEE d MMMM yyyy", { locale: fr })}`}
      />

      <Card className="mb-6 max-w-xs">
        <Label htmlFor="presence-date">Date</Label>
        <Input
          id="presence-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Card>

      {!isLoading && classes.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Classes
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {classes.length}
            </p>
          </Card>
          <Card className="py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              À faire
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{pending}</p>
          </Card>
          <Card className="py-3 col-span-2 sm:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Terminées
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{done}</p>
          </Card>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classes.length === 0 ? (
        <EmptyState message="Aucune classe assignée pour prendre les présences." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((c) => {
            const complete =
              c.studentCount > 0 && c.recordedCount >= c.studentCount;
            const started = c.recordedCount > 0;
            return (
              <Link
                key={c.classId}
                to={`/classes/${c.classId}/presences?date=${date}`}
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
                    <ClassColorDot
                      id={c.classId}
                      name={c.className}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold leading-tight">
                        {c.className}
                      </h2>
                      {c.gradeLevel ? (
                        <p className="text-xs opacity-75">{c.gradeLevel}</p>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        complete ? "success" : started ? "warning" : "info"
                      }
                    >
                      {complete
                        ? "Fait"
                        : started
                          ? "En cours"
                          : "À faire"}
                    </Badge>
                  </div>

                  <p className="mt-4 flex items-center gap-1.5 text-xs opacity-80">
                    <Users className="h-3.5 w-3.5" />
                    {c.studentCount} élève{c.studentCount > 1 ? "s" : ""}
                  </p>
                  {c.recordedCount === 0 ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs opacity-80">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Aucun appel pour cette date
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {c.present} présent{c.present > 1 ? "s" : ""}
                      </span>
                      <span className="font-medium text-rose-700 dark:text-rose-400">
                        {c.absent} absent{c.absent > 1 ? "s" : ""}
                      </span>
                      {c.late > 0 ? (
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {c.late} retard{c.late > 1 ? "s" : ""}
                        </span>
                      ) : null}
                      {c.excused > 0 ? (
                        <span className="font-medium text-sky-700 dark:text-sky-400">
                          {c.excused} justifié{c.excused > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </div>
                  )}
                  <p className="mt-3 text-sm font-medium">
                    {complete ? "Voir / modifier →" : "Prendre les présences →"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
