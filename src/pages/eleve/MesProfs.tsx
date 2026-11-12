import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, UserX, Users } from "lucide-react";
import { isNativeApp } from "@/lib/platform";
import { IOS, INK, MUTED, IosEmpty, SectionCaption, SummaryCard } from "@/components/native/ios";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fullName, joinProfile } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { ScreenSkeleton } from "@/components/Skeleton";
import { QueryError } from "@/components/QueryError";

type AssignmentRow = {
  id: string;
  teacher_id: string;
  subject_id: string;
  matieres: { name: string } | null;
  profils: { first_name: string; last_name: string } | null;
};

type TeacherCard = {
  teacherId: string;
  firstName: string;
  lastName: string;
  subjects: string[];
};

export default function MesProfs() {
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mes-profs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: enrollment, error: enrError } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (enrError) throw enrError;
      if (!enrollment) {
        return { className: null as string | null, teachers: [] as TeacherCard[] };
      }

      const row = enrollment as {
        class_section_id: string;
        classes: unknown;
      };
      const className =
        joinProfile<{ name: string }>(row.classes)?.name ?? null;

      const { data: assignments, error } = await supabase
        .from("affectations_enseignement")
        .select(
          "id, teacher_id, subject_id, matieres(name), profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)",
        )
        .eq("class_section_id", row.class_section_id);
      if (error) throw error;

      const byTeacher = new Map<string, TeacherCard>();
      for (const raw of assignments ?? []) {
        const a = raw as unknown as AssignmentRow;
        const profile = joinProfile(a.profils);
        const existing = byTeacher.get(a.teacher_id);
        const subject = a.matieres?.name?.trim();
        if (existing) {
          if (subject && !existing.subjects.includes(subject)) {
            existing.subjects.push(subject);
          }
          continue;
        }
        byTeacher.set(a.teacher_id, {
          teacherId: a.teacher_id,
          firstName: profile?.first_name ?? "",
          lastName: profile?.last_name ?? "",
          subjects: subject ? [subject] : [],
        });
      }

      const teachers = [...byTeacher.values()].sort((a, b) =>
        fullName(a.firstName, a.lastName).localeCompare(
          fullName(b.firstName, b.lastName),
          "fr",
        ),
      );
      for (const t of teachers) {
        t.subjects.sort((x, y) => x.localeCompare(y, "fr"));
      }

      return { className, teachers };
    },
  });

  const teachers = data?.teachers ?? [];
  const className = data?.className;

  const subtitle = useMemo(() => {
    if (className) return `Enseignants de ${className}`;
    return "Enseignants de votre classe";
  }, [className]);

  if (isNativeApp() && !isLoading && !isError && className && teachers.length > 0) {
    const subjectCount = new Set(teachers.flatMap((t) => t.subjects)).size;
    const palette = [IOS.navy, IOS.teal, IOS.green, IOS.orange, "#7c3aed", IOS.sky];
    const tintFor = (name: string) => {
      let h = 0;
      [...new TextEncoder().encode(name)].forEach((b, i) => {
        h = (h + b * (i + 1)) % 997;
      });
      return palette[h % palette.length];
    };
    return (
      <div className="space-y-4">
        <SummaryCard
          color={IOS.teal}
          icon={<Users className="h-[22px] w-[22px]" fill="currentColor" />}
          caption={className}
          title={`${teachers.length} enseignant${teachers.length === 1 ? "" : "s"}`}
          detail={`${subjectCount} matière${subjectCount === 1 ? "" : "s"}`}
        />
        <SectionCaption>Enseignants</SectionCaption>
        <div className="space-y-[10px]">
          {teachers.map((t) => {
            const name = fullName(t.firstName, t.lastName) || "Enseignant";
            const initials =
              name
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0] ?? "")
                .join("")
                .toUpperCase() || "?";
            return (
              <div key={t.teacherId} className="ios-card flex items-start gap-3 p-[14px]">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                  style={{ backgroundColor: tintFor(name) }}
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className={cn("text-[15px] font-semibold", INK)}>{name}</p>
                  {t.subjects.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {t.subjects.map((sub) => (
                        <span
                          key={sub}
                          className="max-w-full truncate rounded-full bg-[#153064]/[0.08] px-2.5 py-[5px] text-[11px] font-bold text-[#153064] dark:bg-[var(--surface-2)] dark:text-slate-100"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={cn("text-xs", MUTED)}>Matière non précisée</p>
                  )}
                </div>
                <Link
                  to={`/messages?avec=${encodeURIComponent(t.teacherId)}&retour=${encodeURIComponent("/mes-profs")}`}
                  aria-label={`Écrire à ${name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f8fafc] text-[#153064] dark:bg-[var(--surface-2)] dark:text-slate-100"
                >
                  <MessageSquare className="h-[18px] w-[18px]" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (isNativeApp() && !isLoading && !isError) {
    return (
      <IosEmpty
        icon={<UserX strokeWidth={1.4} />}
        title="Aucun enseignant"
        message={className ? "Aucun enseignant affecté à ta classe." : "Aucune classe active trouvée pour ce compte."}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Mes profs" subtitle={subtitle} />

      {isLoading ? (
        <ScreenSkeleton />
      ) : isError ? (
        <QueryError message="Impossible de charger vos enseignants." onRetry={() => void refetch()} />
      ) : !className ? (
        <EmptyState message="Vous n’êtes inscrit dans aucune classe pour le moment." />
      ) : teachers.length === 0 ? (
        <EmptyState message="Aucun enseignant n’est encore affecté à votre classe." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((t) => (
            <Card key={t.teacherId} className="h-full">
              <div className="flex h-full flex-col gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    <PersonName first={t.firstName} last={t.lastName} />
                  </h3>
                  {t.subjects.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {t.subjects.map((s) => (
                        <li
                          key={s}
                          className="text-sm text-slate-600 dark:text-slate-300"
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Matière non précisée</p>
                  )}
                </div>
                <div className="mt-auto">
                  <Link
                    to={`/messages?avec=${encodeURIComponent(t.teacherId)}&retour=${encodeURIComponent("/mes-profs")}`}
                    className="block"
                  >
                    <Button type="button" size="sm" variant="outline" className="w-full">
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
