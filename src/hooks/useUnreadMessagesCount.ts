import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export type UnreadInboxCounts = {
  discussions: number;
  announcements: number;
  total: number;
};

export const EMPTY_UNREAD_INBOX: UnreadInboxCounts = {
  discussions: 0,
  announcements: 0,
  total: 0,
};

export const unreadMessagesQueryKey = (userId: string) =>
  ["messages-unread-count", userId] as const;

function invalidateHomes(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["student-home"] });
  void qc.invalidateQueries({ queryKey: ["parent-home"] });
  void qc.invalidateQueries({ queryKey: ["teacher-home"] });
  void qc.invalidateQueries({ queryKey: ["ecole-home"] });
}

async function fetchUnreadInboxCounts(
  userId: string,
): Promise<UnreadInboxCounts> {
  const [{ count: discussions, error: dErr }, { count: announcements, error: aErr }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null)
        .eq("is_announcement", false),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null)
        .eq("is_announcement", true),
    ]);

  if (dErr) throw dErr;
  if (aErr) throw aErr;

  const d = discussions ?? 0;
  const a = announcements ?? 0;
  return { discussions: d, announcements: a, total: d + a };
}

/** Unread inbound messages count (safe to mount on multiple screens). */
export function useUnreadMessagesCount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: unreadMessagesQueryKey(userId ?? ""),
    enabled: !!userId,
    queryFn: () => fetchUnreadInboxCounts(userId!),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`messages-unread-badge:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void qc.invalidateQueries({
            queryKey: unreadMessagesQueryKey(userId),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

/**
 * Mount once in AppShell: refresh home announcement panels + toast new annonces.
 */
export function useMessagesHomeRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id;
  const onMessagesPage =
    location.pathname.startsWith("/messages") ||
    location.pathname.startsWith("/annonces");

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`messages-home:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          void qc.invalidateQueries({
            queryKey: unreadMessagesQueryKey(userId),
          });
          void qc.invalidateQueries({ queryKey: ["messages-inbox"] });
          invalidateHomes(qc);

          if (payload.eventType !== "INSERT") return;
          const row = payload.new as {
            is_announcement?: boolean;
            subject?: string | null;
            read_at?: string | null;
          };
          if (!row?.is_announcement || row.read_at) return;
          if (onMessagesPage) return;

          toast.message("Nouvelle annonce", {
            description: row.subject?.trim() || "Message de l’école",
            action: {
              label: "Voir",
              onClick: () => navigate("/annonces"),
            },
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc, onMessagesPage, navigate]);
}
