import { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { studentClassIdQueryKey } from "@/hooks/useStudentTimetableUpdates";
import { pendingExamsQueryKey } from "@/hooks/usePendingExamsCount";
import { supabase } from "@/lib/supabase";

type DevoirRow = {
  id?: string;
  kind?: string;
  title?: string | null;
  admin_confirmed?: boolean | null;
  class_section_id?: string | null;
  teacher_id?: string | null;
};

export type ExercicePendingChange = {
  id: string;
  evaluationId: string;
  label: string;
  at: string;
};

export const exercicesPendingQueryKey = (userId: string) =>
  ["exercices-pending-changes", userId] as const;

function exercicesStorageKey(userId: string) {
  return `edufaso:exercices-pending:${userId}`;
}

function readExercicePending(userId: string): ExercicePendingChange[] {
  try {
    const raw = localStorage.getItem(exercicesStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExercicePendingChange[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeExercicePending(userId: string, items: ExercicePendingChange[]) {
  localStorage.setItem(
    exercicesStorageKey(userId),
    JSON.stringify(items.slice(0, 20)),
  );
}

function pushExercicePending(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  item: ExercicePendingChange,
) {
  const next = [
    item,
    ...readExercicePending(userId).filter(
      (c) => c.evaluationId !== item.evaluationId,
    ),
  ].slice(0, 20);
  writeExercicePending(userId, next);
  qc.setQueryData(exercicesPendingQueryKey(userId), next);
}

export function useExercicesPendingChanges() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const enabled = (role === "student" || role === "parent") && !!userId;

  const pendingQuery = useQuery({
    queryKey: exercicesPendingQueryKey(userId ?? ""),
    enabled,
    queryFn: () => readExercicePending(userId!),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const markSeen = useCallback(() => {
    if (!userId) return;
    writeExercicePending(userId, []);
    qc.setQueryData(exercicesPendingQueryKey(userId), []);
  }, [userId, qc]);

  return {
    pending: enabled ? (pendingQuery.data ?? []) : [],
    pendingCount: enabled ? (pendingQuery.data?.length ?? 0) : 0,
    markSeen,
  };
}

function asDevoir(raw: Record<string, unknown> | undefined): DevoirRow | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    kind: typeof raw.type === "string" ? raw.type : undefined,
    title: typeof raw.title === "string" ? raw.title : null,
    admin_confirmed:
      typeof raw.admin_confirmed === "boolean" ? raw.admin_confirmed : null,
    class_section_id:
      typeof raw.class_section_id === "string" ? raw.class_section_id : null,
    teacher_id: typeof raw.teacher_id === "string" ? raw.teacher_id : null,
  };
}

function invalidateStudentExamQueries(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  void qc.invalidateQueries({ queryKey: ["mes-devoirs", userId] });
  void qc.invalidateQueries({ queryKey: ["student-home"] });
}

/**
 * Students: live-refresh exam list/home when admin confirms (or withdraws)
 * an exam for their class. Also toast + badge for new exercices de maison.
 */
export function useStudentExamsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;
  const onExamsPage =
    location.pathname.startsWith("/mes-devoirs") ||
    location.pathname.startsWith("/mes-examens");
  const onExercicesPage = location.pathname.startsWith("/mes-exercices");

  const { data: classId } = useQuery({
    queryKey: studentClassIdQueryKey(userId ?? ""),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", userId!)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return (
        (data as { class_section_id?: string } | null)?.class_section_id ?? null
      );
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled || !userId || !classId) return;

    const channel = supabase
      .channel(`evaluations-student:${classId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evaluations",
          filter: `class_section_id=eq.${classId}`,
        },
        (payload) => {
          const next = asDevoir(
            payload.new as Record<string, unknown> | undefined,
          );
          const prev = asDevoir(
            payload.old as Record<string, unknown> | undefined,
          );
          const row = next ?? prev;
          if (!row) return;

          // Exercices de maison
          if (row.kind === "devoir") {
            invalidateStudentExamQueries(qc, userId);
            if (payload.eventType === "INSERT" && next?.id) {
              const label = next.title?.trim() || "Nouvel exercice";
              if (!onExercicesPage) {
                pushExercicePending(qc, userId, {
                  id: crypto.randomUUID(),
                  evaluationId: next.id,
                  label,
                  at: new Date().toISOString(),
                });
              }
              toast.message("Nouvel exercice de maison", {
                description: label,
              });
            }
            return;
          }

          if (row.kind !== "examen") return;

          invalidateStudentExamQueries(qc, userId);

          const wasConfirmed = prev?.admin_confirmed === true;
          const isConfirmed = next?.admin_confirmed === true;
          if (payload.eventType === "UPDATE" && !wasConfirmed && isConfirmed) {
            toast.success("Devoir confirmé", {
              description:
                next?.title?.trim() || "Un devoir est maintenant visible",
            });
          } else if (
            payload.eventType === "UPDATE" &&
            wasConfirmed &&
            !isConfirmed &&
            onExamsPage
          ) {
            toast.message("Confirmation de devoir retirée", {
              description: prev?.title?.trim() || undefined,
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, classId, onExamsPage, onExercicesPage, qc]);
}

/** Teachers: live-refresh Confirmé / En attente badges + confirmation toast. */
export function useTeacherExamsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const enabled = role === "teacher" && !!userId;

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase
      .channel(`evaluations-teacher:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evaluations",
          filter: `teacher_id=eq.${userId}`,
        },
        (payload) => {
          void qc.invalidateQueries({ queryKey: ["evaluations"] });
          void qc.invalidateQueries({ queryKey: ["teacher-home", userId] });

          if (payload.eventType !== "UPDATE") return;
          const next = asDevoir(
            payload.new as Record<string, unknown> | undefined,
          );
          const prev = asDevoir(
            payload.old as Record<string, unknown> | undefined,
          );
          if (next?.kind !== "examen") return;
          const wasConfirmed = prev?.admin_confirmed === true;
          const isConfirmed = next?.admin_confirmed === true;
          if (!wasConfirmed && isConfirmed) {
            toast.success("Devoir confirmé par l’administration", {
              description: next.title?.trim() || undefined,
            });
          } else if (wasConfirmed && !isConfirmed) {
            toast.message("Confirmation de devoir retirée", {
              description: prev?.title?.trim() || undefined,
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, qc]);
}

/** School admin: live pending-exam badge + examens list. */
export function useSchoolExamsRealtime() {
  const { schoolId, role } = useAuth();
  const qc = useQueryClient();
  const enabled = role === "school_admin" && !!schoolId;

  useEffect(() => {
    if (!enabled || !schoolId) return;

    const channel = supabase
      .channel(`evaluations-school:${schoolId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evaluations",
        },
        (payload) => {
          const next = asDevoir(
            payload.new as Record<string, unknown> | undefined,
          );
          const prev = asDevoir(
            payload.old as Record<string, unknown> | undefined,
          );
          const row = next ?? prev;
          if (row?.kind && row.kind !== "examen") return;

          void qc.invalidateQueries({
            queryKey: pendingExamsQueryKey(schoolId),
          });
          void qc.invalidateQueries({ queryKey: ["ecole-examens"] });
          void qc.invalidateQueries({ queryKey: ["examens-en-attente"] });
          void qc.invalidateQueries({ queryKey: ["ecole-home"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, schoolId, qc]);
}

/** Parents: live devoirs/examens/exercices for linked children. */
export function useParentExamsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "parent" && !!userId;
  const onChildExercices = /\/enfants\/[^/]+\/exercices/.test(
    location.pathname,
  );

  const { data: childClassIds = [] } = useQuery({
    queryKey: ["parent-child-class-ids", userId],
    enabled,
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("liens_parent_eleve")
        .select("student_id")
        .eq("parent_id", userId!);
      if (error) throw error;
      const studentIds = (links ?? []).map(
        (r) => (r as { student_id: string }).student_id,
      );
      if (studentIds.length === 0) return [] as string[];

      const { data: insc, error: inscError } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .in("student_id", studentIds)
        .eq("status", "active");
      if (inscError) throw inscError;
      return [
        ...new Set(
          (insc ?? [])
            .map((r) => (r as { class_section_id: string }).class_section_id)
            .filter(Boolean),
        ),
      ];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled || !userId || childClassIds.length === 0) return;

    const classSet = new Set(childClassIds);
    const channel = supabase
      .channel(`evaluations-parent:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "evaluations",
        },
        (payload) => {
          const next = asDevoir(
            payload.new as Record<string, unknown> | undefined,
          );
          const prev = asDevoir(
            payload.old as Record<string, unknown> | undefined,
          );
          const row = next ?? prev;
          if (!row?.class_section_id || !classSet.has(row.class_section_id)) {
            return;
          }

          void qc.invalidateQueries({ queryKey: ["parent-home"] });
          void qc.invalidateQueries({ queryKey: ["enfants"] });
          void qc.invalidateQueries({ queryKey: ["enfant-devoirs"] });

          if (row.kind === "devoir") {
            if (payload.eventType === "INSERT" && next?.id) {
              const label = next.title?.trim() || "Nouvel exercice";
              if (!onChildExercices) {
                pushExercicePending(qc, userId, {
                  id: crypto.randomUUID(),
                  evaluationId: next.id,
                  label,
                  at: new Date().toISOString(),
                });
              }
              toast.message("Nouvel exercice de maison", {
                description: label,
              });
            }
            return;
          }

          if (row.kind !== "examen") return;
          const wasConfirmed = prev?.admin_confirmed === true;
          const isConfirmed = next?.admin_confirmed === true;
          if (
            payload.eventType === "UPDATE" &&
            !wasConfirmed &&
            isConfirmed
          ) {
            toast.success("Devoir confirmé", {
              description:
                next?.title?.trim() || "Un devoir est maintenant visible",
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, childClassIds, onChildExercices, qc]);
}
