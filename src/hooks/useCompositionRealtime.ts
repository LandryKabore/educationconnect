import { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { studentClassIdQueryKey } from "@/hooks/useStudentTimetableUpdates";
import { supabase } from "@/lib/supabase";

export type CompositionPendingChange = {
  id: string;
  sessionId: string;
  label: string;
  classSectionId?: string;
  at: string;
};

export const compositionsPendingQueryKey = (userId: string) =>
  ["compositions-pending-changes", userId] as const;

function storageKey(userId: string) {
  return `edufaso:compositions-pending:${userId}`;
}

function readPending(userId: string): CompositionPendingChange[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompositionPendingChange[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writePending(userId: string, items: CompositionPendingChange[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 20)));
}

function pushPending(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  item: CompositionPendingChange,
) {
  const next = [
    item,
    ...readPending(userId).filter((c) => c.sessionId !== item.sessionId),
  ].slice(0, 20);
  writePending(userId, next);
  qc.setQueryData(compositionsPendingQueryKey(userId), next);
}

type SessionRow = {
  id?: string;
  title?: string | null;
  period_label?: string | null;
  class_section_id?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

function asSession(raw: Record<string, unknown> | undefined): SessionRow | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : null,
    period_label: typeof raw.period_label === "string" ? raw.period_label : null,
    class_section_id:
      typeof raw.class_section_id === "string" ? raw.class_section_id : null,
    starts_on: typeof raw.starts_on === "string" ? raw.starts_on : null,
    ends_on: typeof raw.ends_on === "string" ? raw.ends_on : null,
  };
}

function sessionLabel(row: SessionRow) {
  const title = row.title?.trim() || "Composition";
  const period = row.period_label?.trim();
  return period ? `${title} · ${period}` : title;
}

export function useCompositionsPendingChanges() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const enabled = (role === "student" || role === "parent") && !!userId;

  const pendingQuery = useQuery({
    queryKey: compositionsPendingQueryKey(userId ?? ""),
    enabled,
    queryFn: () => readPending(userId!),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const markSeen = useCallback(() => {
    if (!userId) return;
    writePending(userId, []);
    qc.setQueryData(compositionsPendingQueryKey(userId), []);
  }, [userId, qc]);

  return {
    pending: enabled ? (pendingQuery.data ?? []) : [],
    pendingCount: enabled ? (pendingQuery.data?.length ?? 0) : 0,
    markSeen,
  };
}

/** Students: toast + badge when a composition session is scheduled/updated. */
export function useStudentCompositionsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;
  const onPage = location.pathname.startsWith("/mes-compositions");

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
      .channel(`compositions-student:${classId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "composition_sessions",
          filter: `class_section_id=eq.${classId}`,
        },
        (payload) => {
          const next = asSession(
            payload.new as Record<string, unknown> | undefined,
          );
          const prev = asSession(
            payload.old as Record<string, unknown> | undefined,
          );
          const row = next ?? prev;
          if (!row?.id) return;

          void qc.invalidateQueries({ queryKey: ["mes-compositions", userId] });
          void qc.invalidateQueries({ queryKey: ["student-home"] });

          if (payload.eventType === "DELETE") {
            if (!onPage) {
              toast.message("Composition annulée", {
                description: sessionLabel(prev ?? row),
              });
            }
            return;
          }

          const label = sessionLabel(next ?? row);
          if (onPage) {
            toast.message(
              payload.eventType === "INSERT"
                ? "Nouvelle composition"
                : "Composition mise à jour",
              { description: label },
            );
            return;
          }

          pushPending(qc, userId, {
            id: crypto.randomUUID(),
            sessionId: row.id,
            label,
            classSectionId: classId,
            at: new Date().toISOString(),
          });
          toast.message(
            payload.eventType === "INSERT"
              ? "Nouvelle composition"
              : "Composition mise à jour",
            { description: label },
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, classId, onPage, qc]);
}

/** Parents: toast + pending when a child's composition session changes. */
export function useParentCompositionsRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "parent" && !!userId;
  const onChildCompositions = /\/enfants\/[^/]+\/compositions/.test(
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
      .channel(`compositions-parent:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "composition_sessions",
        },
        (payload) => {
          const next = asSession(
            payload.new as Record<string, unknown> | undefined,
          );
          const prev = asSession(
            payload.old as Record<string, unknown> | undefined,
          );
          const row = next ?? prev;
          if (!row?.class_section_id || !classSet.has(row.class_section_id)) {
            return;
          }

          void qc.invalidateQueries({ queryKey: ["parent-home"] });
          void qc.invalidateQueries({ queryKey: ["enfants"] });
          void qc.invalidateQueries({ queryKey: ["enfant-compositions"] });

          if (!row.id) return;
          const label = sessionLabel(next ?? row);

          if (payload.eventType === "DELETE") {
            toast.message("Composition annulée", { description: label });
            return;
          }

          if (!onChildCompositions) {
            pushPending(qc, userId, {
              id: crypto.randomUUID(),
              sessionId: row.id,
              label,
              classSectionId: row.class_section_id,
              at: new Date().toISOString(),
            });
          }

          toast.message(
            payload.eventType === "INSERT"
              ? "Nouvelle composition"
              : "Composition mise à jour",
            { description: label },
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, childClassIds, onChildCompositions, qc]);
}
