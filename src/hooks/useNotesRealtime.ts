import { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { joinProfile, personName } from "@/lib/utils";

type NoteRow = {
  id?: string;
  student_id?: string | null;
  subject_id?: string | null;
  score?: number | null;
  max_score?: number | null;
  is_absent?: boolean | null;
  period_label?: string | null;
};

export type NotesPendingChange = {
  id: string;
  noteId: string;
  label: string;
  childId?: string;
  at: string;
};

export const notesPendingQueryKey = (userId: string) =>
  ["notes-pending-changes", userId] as const;

export const parentChildrenQueryKey = (userId: string) =>
  ["parent-child-ids", userId] as const;

function storageKey(userId: string) {
  return `edufaso:notes-pending:${userId}`;
}

function readPending(userId: string): NotesPendingChange[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotesPendingChange[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writePending(userId: string, items: NotesPendingChange[]) {
  localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 20)));
}

function asNote(raw: Record<string, unknown> | undefined): NoteRow | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    student_id: typeof raw.student_id === "string" ? raw.student_id : null,
    subject_id: typeof raw.subject_id === "string" ? raw.subject_id : null,
    score: typeof raw.score === "number" ? raw.score : Number(raw.score ?? NaN),
    max_score:
      typeof raw.max_score === "number"
        ? raw.max_score
        : Number(raw.max_score ?? NaN),
    is_absent:
      typeof raw.is_absent === "boolean" ? raw.is_absent : Boolean(raw.is_absent),
    period_label:
      typeof raw.period_label === "string" ? raw.period_label : null,
  };
}

async function subjectName(subjectId: string | null | undefined) {
  if (!subjectId) return "Matière";
  const { data } = await supabase
    .from("matieres")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name?.trim() || "Matière";
}

function scoreLabel(row: NoteRow) {
  if (row.is_absent) return "Absent";
  if (
    row.score == null ||
    row.max_score == null ||
    Number.isNaN(row.score) ||
    Number.isNaN(row.max_score)
  ) {
    return "Note mise à jour";
  }
  return `${row.score} / ${row.max_score}`;
}

function invalidateStudentNotes(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  void qc.invalidateQueries({ queryKey: ["mes-notes", userId] });
  void qc.invalidateQueries({ queryKey: ["student-home"] });
  void qc.invalidateQueries({ queryKey: ["mes-periodes-notes", userId] });
  void qc.invalidateQueries({ queryKey: ["mon-inscription-bulletin", userId] });
}

function invalidateParentNotes(
  qc: ReturnType<typeof useQueryClient>,
  childId: string,
) {
  void qc.invalidateQueries({ queryKey: ["enfant-notes", childId] });
  void qc.invalidateQueries({ queryKey: ["parent-home"] });
  void qc.invalidateQueries({ queryKey: ["enfants"] });
}

function pushPending(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  item: NotesPendingChange,
) {
  const next = [
    item,
    ...readPending(userId).filter((c) => c.noteId !== item.noteId),
  ].slice(0, 20);
  writePending(userId, next);
  qc.setQueryData(notesPendingQueryKey(userId), next);
}

/** Pending note alerts + mark as seen (sidebar badge). */
export function useNotesPendingChanges() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const enabled =
    !!userId && (role === "student" || role === "parent");

  const pendingQuery = useQuery({
    queryKey: notesPendingQueryKey(userId ?? ""),
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
      qc.setQueryData(notesPendingQueryKey(userId), next);
    },
    [userId, qc],
  );

  return {
    pending: enabled ? (pendingQuery.data ?? []) : [],
    pendingCount: enabled ? (pendingQuery.data?.length ?? 0) : 0,
    markSeen,
  };
}

export function useParentChildIds() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const enabled = role === "parent" && !!userId;

  return useQuery({
    queryKey: parentChildrenQueryKey(userId ?? ""),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liens_parent_eleve")
        .select(
          "student_id, profils:profils!liens_parent_eleve_student_id_fkey(first_name, last_name)",
        )
        .eq("parent_id", userId!);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as {
          student_id: string;
          profils: unknown;
        };
        const profil = joinProfile(r.profils);
        return {
          id: r.student_id,
          name: personName(profil?.first_name, profil?.last_name),
        };
      });
    },
    staleTime: 60_000,
  });
}

/** Students: live notes + home averages + sidebar attention. */
export function useStudentNotesRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "student" && !!userId;
  const onNotesPage = location.pathname.startsWith("/mes-notes");

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase
      .channel(`notes-student:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `student_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
            const row = asNote(
              (payload.eventType === "DELETE"
                ? payload.old
                : payload.new) as Record<string, unknown> | undefined,
            );
            if (!row?.id) return;

            invalidateStudentNotes(qc, userId);

            if (payload.eventType === "DELETE") return;

            const subject = await subjectName(row.subject_id);
            const label = `${subject} · ${scoreLabel(row)}${
              row.period_label ? ` · ${row.period_label}` : ""
            }`;

            if (onNotesPage) {
              toast.success("Note mise à jour", { description: label });
              return;
            }

            toast.success("Nouvelle note", { description: label });
            pushPending(qc, userId, {
              id: crypto.randomUUID(),
              noteId: row.id,
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
  }, [enabled, userId, onNotesPage, qc]);
}

/** Parents: live child notes + home + Enfants badge. */
export function useParentNotesRealtime() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const userId = user?.id;
  const enabled = role === "parent" && !!userId;
  const { data: children = [] } = useParentChildIds();
  const onChildNotes =
    location.pathname.includes("/enfants/") &&
    location.pathname.includes("/notes");

  useEffect(() => {
    if (!enabled || !userId || children.length === 0) return;

    const childMap = new Map(children.map((c) => [c.id, c.name]));
    const channel = supabase
      .channel(`notes-parent:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
        },
        (payload) => {
          void (async () => {
            const row = asNote(
              (payload.eventType === "DELETE"
                ? payload.old
                : payload.new) as Record<string, unknown> | undefined,
            );
            if (!row?.id || !row.student_id) return;
            if (!childMap.has(row.student_id)) return;

            invalidateParentNotes(qc, row.student_id);
            if (payload.eventType === "DELETE") return;

            const childName = childMap.get(row.student_id) || "Enfant";
            const subject = await subjectName(row.subject_id);
            const label = `${childName} · ${subject} · ${scoreLabel(row)}`;

            if (onChildNotes) {
              toast.success("Note mise à jour", { description: label });
              return;
            }

            toast.success("Nouvelle note", { description: label });
            pushPending(qc, userId, {
              id: crypto.randomUUID(),
              noteId: row.id,
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
  }, [enabled, userId, children, onChildNotes, qc]);
}
