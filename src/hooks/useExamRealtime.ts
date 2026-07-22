import { useEffect } from "react";
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

function asDevoir(raw: Record<string, unknown> | undefined): DevoirRow | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    // "type" on evaluations covers interrogation/devoir/composition/examen;
    // only "devoir" and "examen" are schedule-relevant here.
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
 * an exam for their class.
 */
export function useStudentExamsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;
  const onExamsPage = location.pathname.startsWith("/mes-devoirs") || location.pathname.startsWith("/mes-examens");

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
          if (!row || row.kind !== "examen") {
            // Homework changes still refresh exercise lists.
            if (row?.kind === "devoir") {
              invalidateStudentExamQueries(qc, userId);
            }
            return;
          }

          invalidateStudentExamQueries(qc, userId);

          const wasConfirmed = prev?.admin_confirmed === true;
          const isConfirmed = next?.admin_confirmed === true;
          if (payload.eventType === "UPDATE" && !wasConfirmed && isConfirmed) {
            toast.success("Devoir confirmé", {
              description: next?.title?.trim() || "Un devoir est maintenant visible",
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
  }, [enabled, userId, classId, onExamsPage, qc]);
}

/** Teachers: live-refresh Confirmé / En attente badges. */
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
        () => {
          void qc.invalidateQueries({ queryKey: ["evaluations"] });
          void qc.invalidateQueries({ queryKey: ["teacher-home", userId] });
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

/** Parents: live devoirs/examens for linked children. */
export function useParentExamsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "parent" && !!userId;

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

          if (row.kind !== "examen") return;
          const wasConfirmed = prev?.admin_confirmed === true;
          const isConfirmed = next?.admin_confirmed === true;
          if (
            payload.eventType === "UPDATE" &&
            !wasConfirmed &&
            isConfirmed &&
            !location.pathname.startsWith("/messages")
          ) {
            toast.success("Devoir confirmé", {
              description: next?.title?.trim() || "Un devoir est maintenant visible",
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, childClassIds, location.pathname, qc]);
}
