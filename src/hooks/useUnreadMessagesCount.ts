import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export const unreadMessagesQueryKey = (userId: string) =>
  ["messages-unread-count", userId] as const;

/** Unread inbound messages for the current user (all portals). */
export function useUnreadMessagesCount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: unreadMessagesQueryKey(userId ?? ""),
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`messages-unread-badge:${userId}`)
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
