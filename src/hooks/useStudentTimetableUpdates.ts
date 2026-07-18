import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatDay } from "@/lib/pdfBulletin";
import { supabase } from "@/lib/supabase";

export type EdtChangeKind = "added" | "updated" | "removed";

export type EdtPendingChange = {
  id: string;
  slotId: string;
  kind: EdtChangeKind;
  label: string;
  at: string;
};

export const edtPendingQueryKey = (userId: string) =>
  ["edt-pending-changes", userId] as const;

export const studentClassIdQueryKey = (userId: string) =>
  ["student-class-id", userId] as const;

function storageKey(userId: string) {
  return `edufaso:edt-pending:${userId}`;
}

function readPending(userId: string): EdtPendingChange[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EdtPendingChange[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writePending(userId: string, items: EdtPendingChange[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 20)));
}

type CreneauPayload = {
  id: string;
  class_section_id: string;
  subject_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string | null;
};

async function describeCreneau(row: CreneauPayload): Promise<string> {
  const { data } = await supabase
    .from("matieres")
    .select("name")
    .eq("id", row.subject_id)
    .maybeSingle();
  const subject = (data as { name?: string } | null)?.name ?? "Cours";
  const day = formatDay(row.day_of_week);
  const start = row.start_time?.slice(0, 5) ?? "??";
  const end = row.end_time?.slice(0, 5) ?? "??";
  const room = row.room?.trim() ? ` · salle ${row.room.trim()}` : "";
  return `${subject} · ${day} ${start}–${end}${room}`;
}

function kindFromEvent(eventType: string): EdtChangeKind {
  if (eventType === "INSERT") return "added";
  if (eventType === "DELETE") return "removed";
  return "updated";
}

function kindLabel(kind: EdtChangeKind) {
  if (kind === "added") return "Ajouté";
  if (kind === "removed") return "Supprimé";
  return "Modifié";
}

/** Pending EDT changes + mark as seen (safe to use on multiple screens). */
export function useEdtPendingChanges() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;

  const pendingQuery = useQuery({
    queryKey: edtPendingQueryKey(userId ?? ""),
    enabled,
    queryFn: () => readPending(userId!),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const markSeen = () => {
    if (!userId) return;
    writePending(userId, []);
    qc.setQueryData(edtPendingQueryKey(userId), []);
  };

  return {
    pending: enabled ? (pendingQuery.data ?? []) : [],
    pendingCount: enabled ? (pendingQuery.data?.length ?? 0) : 0,
    markSeen,
  };
}

/**
 * Subscribe once (AppShell): live-refresh student EDT queries + queue badge
 * changes when the student is not on the timetable page.
 */
export function useStudentTimetableRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;
  const onEdtPage = location.pathname.startsWith("/mon-emploi-du-temps");

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
      .channel(`edt-student:${classId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creneaux_edt",
          filter: `class_section_id=eq.${classId}`,
        },
        (payload) => {
          void (async () => {
            void qc.invalidateQueries({ queryKey: ["mon-edt", userId] });
            void qc.invalidateQueries({ queryKey: ["student-home", userId] });

            const kind = kindFromEvent(payload.eventType);
            const row = (
              payload.eventType === "DELETE" ? payload.old : payload.new
            ) as CreneauPayload | undefined;
            if (!row?.id) return;

            const label = await describeCreneau(row);

            if (onEdtPage) {
              toast.message("Emploi du temps mis à jour", {
                description: `${kindLabel(kind)} : ${label}`,
              });
              return;
            }

            const next: EdtPendingChange[] = [
              {
                id: crypto.randomUUID(),
                slotId: row.id,
                kind,
                label,
                at: new Date().toISOString(),
              },
              ...readPending(userId).filter((c) => c.slotId !== row.id),
            ].slice(0, 20);

            writePending(userId, next);
            qc.setQueryData(edtPendingQueryKey(userId), next);
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, classId, onEdtPage, qc]);
}

/** School admin: live-refresh emplois du temps list. */
export function useSchoolTimetableRealtime(schoolId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!schoolId) return;

    const channel = supabase
      .channel(`edt-school:${schoolId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "creneaux_edt",
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["creneaux", schoolId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [schoolId, qc]);
}
