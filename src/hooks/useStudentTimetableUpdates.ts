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

function isBrokenLabel(label: string) {
  return /undefined|\?\?/.test(label);
}

function readPending(userId: string): EdtPendingChange[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EdtPendingChange[];
    if (!Array.isArray(parsed)) return [];
    const cleaned = parsed
      .filter((c) => c && typeof c.label === "string" && !isBrokenLabel(c.label))
      .slice(0, 20);
    if (cleaned.length !== parsed.length) {
      writePending(userId, cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
}

function writePending(userId: string, items: EdtPendingChange[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 20)));
}

type CreneauSnapshot = {
  id: string;
  class_section_id?: string;
  subject_id?: string | null;
  day_of_week?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  room?: string | null;
  subjectName?: string | null;
};

/** Last-known créneaux — DELETE realtime often only sends the id. */
const slotSnapshots = new Map<string, CreneauSnapshot>();

function rememberSlot(row: CreneauSnapshot) {
  if (!row?.id) return;
  const prev = slotSnapshots.get(row.id);
  slotSnapshots.set(row.id, {
    ...prev,
    ...row,
    subjectName: row.subjectName ?? prev?.subjectName ?? null,
  });
}

function rememberSlots(rows: CreneauSnapshot[]) {
  for (const row of rows) rememberSlot(row);
}

function normalizeTime(t: string | null | undefined) {
  if (!t) return null;
  return t.slice(0, 5);
}

function dayLabel(day: number | null | undefined) {
  if (day == null || Number.isNaN(Number(day))) return null;
  const n = Number(day);
  if (n < 1 || n > 7) return null;
  return formatDay(n);
}

async function describeCreneau(row: CreneauSnapshot): Promise<string> {
  let subject = row.subjectName?.trim() || null;
  if (!subject && row.subject_id) {
    const { data } = await supabase
      .from("matieres")
      .select("name")
      .eq("id", row.subject_id)
      .maybeSingle();
    subject = (data as { name?: string } | null)?.name ?? null;
  }

  const day = dayLabel(row.day_of_week);
  const start = normalizeTime(row.start_time);
  const end = normalizeTime(row.end_time);
  const room = row.room?.trim() ? ` · salle ${row.room.trim()}` : "";

  const parts: string[] = [subject || "Cours"];
  if (day && start && end) parts.push(`${day} ${start}–${end}`);
  else if (day && start) parts.push(`${day} ${start}`);
  else if (day) parts.push(day);
  else if (start && end) parts.push(`${start}–${end}`);

  return `${parts.join(" · ")}${room}`;
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

function asSnapshot(raw: Record<string, unknown> | undefined): CreneauSnapshot | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    class_section_id:
      typeof raw.class_section_id === "string" ? raw.class_section_id : undefined,
    subject_id: typeof raw.subject_id === "string" ? raw.subject_id : null,
    day_of_week:
      typeof raw.day_of_week === "number"
        ? raw.day_of_week
        : raw.day_of_week != null
          ? Number(raw.day_of_week)
          : null,
    start_time: typeof raw.start_time === "string" ? raw.start_time : null,
    end_time: typeof raw.end_time === "string" ? raw.end_time : null,
    room: typeof raw.room === "string" ? raw.room : null,
  };
}

function mergeWithCache(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  partial: CreneauSnapshot,
): CreneauSnapshot {
  const cached = qc.getQueryData(["mon-edt", userId]) as
    | {
        id: string;
        subject_id?: string;
        day_of_week?: number;
        start_time?: string;
        end_time?: string;
        room?: string | null;
        matieres?: { name: string } | null;
      }[]
    | undefined;

  const fromQuery = cached?.find((s) => s.id === partial.id);
  const fromMap = slotSnapshots.get(partial.id);

  const merged: CreneauSnapshot = {
    ...fromMap,
    ...fromQuery,
    ...partial,
    subjectName:
      partial.subjectName ||
      fromQuery?.matieres?.name ||
      fromMap?.subjectName ||
      null,
    subject_id:
      partial.subject_id ||
      fromQuery?.subject_id ||
      fromMap?.subject_id ||
      null,
    day_of_week:
      partial.day_of_week ??
      fromQuery?.day_of_week ??
      fromMap?.day_of_week ??
      null,
    start_time:
      partial.start_time ||
      fromQuery?.start_time ||
      fromMap?.start_time ||
      null,
    end_time:
      partial.end_time || fromQuery?.end_time || fromMap?.end_time || null,
    room: partial.room ?? fromQuery?.room ?? fromMap?.room ?? null,
  };

  rememberSlot(merged);
  return merged;
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

  // Seed snapshots so DELETE events still know day/time/subject.
  useEffect(() => {
    if (!enabled || !classId) return;

    void (async () => {
      const { data } = await supabase
        .from("creneaux_edt")
        .select(
          "id, class_section_id, subject_id, day_of_week, start_time, end_time, room, matieres(name)",
        )
        .eq("class_section_id", classId);
      rememberSlots(
        (data ?? []).map((row) => {
          const r = row as {
            id: string;
            class_section_id: string;
            subject_id: string;
            day_of_week: number;
            start_time: string;
            end_time: string;
            room: string | null;
            matieres: { name: string } | null;
          };
          return {
            id: r.id,
            class_section_id: r.class_section_id,
            subject_id: r.subject_id,
            day_of_week: r.day_of_week,
            start_time: r.start_time,
            end_time: r.end_time,
            room: r.room,
            subjectName: r.matieres?.name ?? null,
          };
        }),
      );
    })();
  }, [enabled, classId]);

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
            const kind = kindFromEvent(payload.eventType);
            const raw = (
              payload.eventType === "DELETE" ? payload.old : payload.new
            ) as Record<string, unknown> | undefined;
            const partial = asSnapshot(raw);
            if (!partial?.id) return;

            // Merge cache/snapshot BEFORE invalidate (DELETE old may be id-only).
            const merged = mergeWithCache(qc, userId, partial);
            const label = await describeCreneau(merged);

            if (payload.eventType === "DELETE") {
              slotSnapshots.delete(partial.id);
            } else {
              rememberSlot(merged);
            }

            void qc.invalidateQueries({ queryKey: ["mon-edt", userId] });
            void qc.invalidateQueries({ queryKey: ["student-home", userId] });

            if (onEdtPage) {
              toast.message("Emploi du temps mis à jour", {
                description: `${kindLabel(kind)} : ${label}`,
              });
              return;
            }

            const next: EdtPendingChange[] = [
              {
                id: crypto.randomUUID(),
                slotId: partial.id,
                kind,
                label,
                at: new Date().toISOString(),
              },
              ...readPending(userId).filter((c) => c.slotId !== partial.id),
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
