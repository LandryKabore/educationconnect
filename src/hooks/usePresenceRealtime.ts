import { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useParentChildIds } from "@/hooks/useNotesRealtime";
import { ATTENDANCE_LABELS } from "@/lib/attendance";
import { supabase } from "@/lib/supabase";
import type { AttendanceStatus } from "@/lib/types";

type PresenceRow = {
  id?: string;
  student_id?: string | null;
  status?: AttendanceStatus | null;
  date?: string | null;
  subject_id?: string | null;
  class_section_id?: string | null;
};

export type PresencePendingChange = {
  id: string;
  presenceId: string;
  label: string;
  childId?: string;
  at: string;
};

export const presencePendingQueryKey = (userId: string) =>
  ["presence-pending-changes", userId] as const;

function storageKey(userId: string) {
  return `edufaso:presence-pending:${userId}`;
}

function readPending(userId: string): PresencePendingChange[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PresencePendingChange[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writePending(userId: string, items: PresencePendingChange[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 20)));
}

function asPresence(
  raw: Record<string, unknown> | undefined,
): PresenceRow | null {
  if (!raw || typeof raw.id !== "string") return null;
  const status =
    typeof raw.status === "string" ? (raw.status as AttendanceStatus) : null;
  return {
    id: raw.id,
    student_id: typeof raw.student_id === "string" ? raw.student_id : null,
    status,
    date: typeof raw.date === "string" ? raw.date : null,
    subject_id: typeof raw.subject_id === "string" ? raw.subject_id : null,
    class_section_id:
      typeof raw.class_section_id === "string" ? raw.class_section_id : null,
  };
}

function needsAttention(status: AttendanceStatus | null | undefined) {
  return status === "absent" || status === "late";
}

async function subjectName(subjectId: string | null | undefined) {
  if (!subjectId) return null;
  const { data } = await supabase
    .from("matieres")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name?.trim() || null;
}

function pushPending(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  item: PresencePendingChange,
) {
  const next = [
    item,
    ...readPending(userId).filter((c) => c.presenceId !== item.presenceId),
  ].slice(0, 20);
  writePending(userId, next);
  qc.setQueryData(presencePendingQueryKey(userId), next);
}

function invalidateStudentPresence(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  void qc.invalidateQueries({ queryKey: ["mes-presences", userId] });
  void qc.invalidateQueries({ queryKey: ["student-home"] });
}

function invalidateParentPresence(
  qc: ReturnType<typeof useQueryClient>,
  childId: string,
) {
  void qc.invalidateQueries({ queryKey: ["enfant-presences", childId] });
  void qc.invalidateQueries({ queryKey: ["parent-home"] });
  void qc.invalidateQueries({ queryKey: ["enfants"] });
}

/** Pending absence/late alerts + mark as seen. */
export function usePresencePendingChanges() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const enabled =
    !!userId && (role === "student" || role === "parent");

  const pendingQuery = useQuery({
    queryKey: presencePendingQueryKey(userId ?? ""),
    enabled,
    queryFn: () => readPending(userId!),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const markSeen = useCallback(
    (childId?: string) => {
      if (!userId) return;
      const next = childId
        ? readPending(userId).filter((c) => c.childId !== childId)
        : [];
      writePending(userId, next);
      qc.setQueryData(presencePendingQueryKey(userId), next);
    },
    [userId, qc],
  );

  return {
    pending: enabled ? (pendingQuery.data ?? []) : [],
    pendingCount: enabled ? (pendingQuery.data?.length ?? 0) : 0,
    markSeen,
  };
}

/** Students: live attendance + home rate + sidebar badge. */
export function useStudentPresenceRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;
  const onPresencesPage = location.pathname.startsWith("/mes-presences");

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase
      .channel(`presences-student:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presences",
          filter: `student_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
            const next = asPresence(
              payload.new as Record<string, unknown> | undefined,
            );
            const prev = asPresence(
              payload.old as Record<string, unknown> | undefined,
            );
            const row = next ?? prev;
            if (!row?.id) return;

            invalidateStudentPresence(qc, userId);

            if (payload.eventType === "DELETE") return;
            if (!needsAttention(next?.status)) return;

            const subject = await subjectName(next?.subject_id);
            const statusLabel =
              ATTENDANCE_LABELS[next!.status!] ?? next!.status!;
            const label = [
              statusLabel,
              subject,
              next?.date ? next.date.slice(0, 10) : null,
            ]
              .filter(Boolean)
              .join(" · ");

            if (onPresencesPage) {
              toast.message("Présence mise à jour", { description: label });
              return;
            }

            toast.message(
              next?.status === "absent" ? "Absence enregistrée" : "Retard enregistré",
              { description: label },
            );
            pushPending(qc, userId, {
              id: crypto.randomUUID(),
              presenceId: row.id,
              label,
              at: new Date().toISOString(),
            });
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, onPresencesPage, qc]);
}

/** Parents: live child attendance alerts. */
export function useParentPresenceRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "parent" && !!userId;
  const { data: children = [] } = useParentChildIds();
  const onChildPresences =
    location.pathname.includes("/enfants/") &&
    location.pathname.includes("/presences");

  useEffect(() => {
    if (!enabled || !userId || children.length === 0) return;

    const childMap = new Map(children.map((c) => [c.id, c.name]));
    const channel = supabase
      .channel(`presences-parent:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presences",
        },
        (payload) => {
          void (async () => {
            const next = asPresence(
              payload.new as Record<string, unknown> | undefined,
            );
            const prev = asPresence(
              payload.old as Record<string, unknown> | undefined,
            );
            const row = next ?? prev;
            if (!row?.id || !row.student_id) return;
            if (!childMap.has(row.student_id)) return;

            invalidateParentPresence(qc, row.student_id);
            if (payload.eventType === "DELETE") return;
            if (!needsAttention(next?.status)) return;

            const childName = childMap.get(row.student_id) || "Enfant";
            const subject = await subjectName(next?.subject_id);
            const statusLabel =
              ATTENDANCE_LABELS[next!.status!] ?? next!.status!;
            const label = [
              childName,
              statusLabel,
              subject,
              next?.date ? next.date.slice(0, 10) : null,
            ]
              .filter(Boolean)
              .join(" · ");

            if (onChildPresences) {
              toast.message("Présence mise à jour", { description: label });
              return;
            }

            toast.message(
              next?.status === "absent"
                ? "Absence de votre enfant"
                : "Retard de votre enfant",
              { description: label },
            );
            pushPending(qc, userId, {
              id: crypto.randomUUID(),
              presenceId: row.id,
              childId: row.student_id,
              label,
              at: new Date().toISOString(),
            });
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, children, onChildPresences, qc]);
}

/** School admin: live Présences du jour + presence board. */
export function useSchoolPresenceRealtime() {
  const { schoolId, role } = useAuth();
  const qc = useQueryClient();
  const enabled = role === "school_admin" && !!schoolId;

  useEffect(() => {
    if (!enabled || !schoolId) return;

    const channel = supabase
      .channel(`presences-school:${schoolId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presences",
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["ecole-presences"] });
          void qc.invalidateQueries({ queryKey: ["ecole-home"] });
          void qc.invalidateQueries({ queryKey: ["eleve-presences"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, schoolId, qc]);
}
