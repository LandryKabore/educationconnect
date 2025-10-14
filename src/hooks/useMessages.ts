import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Message {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  subject: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
  sender?: {
    first_name: string;
    last_name: string;
    role: string;
  };
  recipient?: {
    first_name: string;
    last_name: string;
    role: string;
  };
}

export interface Conversation {
  user_id: string;
  user_name: string;
  user_role: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export const useMessages = () => {
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      fetchConversations();
      subscribeToMessages();
    }
  }, [currentUserId]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `recipient_user_id=eq.${currentUserId}`
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchConversations = async () => {
    try {
      if (!currentUserId) return;

      // Fetch all messages where user is sender or recipient
      const { data: messages, error } = await supabase
        .from("messages")
        .select(`
          *,
          sender:profiles!messages_sender_user_id_fkey(first_name, last_name, role),
          recipient:profiles!messages_recipient_user_id_fkey(first_name, last_name, role)
        `)
        .or(`sender_user_id.eq.${currentUserId},recipient_user_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group messages by conversation partner
      const conversationMap = new Map<string, Conversation>();

      for (const message of messages || []) {
        const isReceived = message.recipient_user_id === currentUserId;
        const partnerId = isReceived ? message.sender_user_id : message.recipient_user_id;
        const partner = isReceived ? message.sender : message.recipient;

        if (!conversationMap.has(partnerId)) {
          let displayName = `${partner?.first_name || 'Unknown'} ${partner?.last_name || 'User'}`;
          
          // If partner is a parent, fetch their child's name
          if (partner?.role === 'parent') {
            const { data: parentLinks } = await supabase
              .from("parent_student_links")
              .select("student_user_id")
              .eq("parent_user_id", partnerId)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();
            
            if (parentLinks?.student_user_id) {
              const { data: studentProfile } = await supabase
                .from("profiles")
                .select("first_name, last_name")
                .eq("user_id", parentLinks.student_user_id)
                .maybeSingle();
              
              if (studentProfile) {
                const childName = `${studentProfile.first_name} ${studentProfile.last_name}`;
                displayName = `${displayName} (${childName})`;
              }
            }
          }
          
          conversationMap.set(partnerId, {
            user_id: partnerId,
            user_name: displayName,
            user_role: partner?.role || 'unknown',
            last_message: message.body,
            last_message_at: message.created_at,
            unread_count: 0,
          });
        }

        // Count unread messages
        if (isReceived && !message.read_at) {
          const conv = conversationMap.get(partnerId)!;
          conv.unread_count++;
        }
      }

      setConversations(Array.from(conversationMap.values()));
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchConversationWith = async (userId: string) => {
    try {
      if (!currentUserId) return;

      const { data: messages, error } = await supabase
        .from("messages")
        .select(`
          *,
          sender:profiles!messages_sender_user_id_fkey(first_name, last_name, role),
          recipient:profiles!messages_recipient_user_id_fkey(first_name, last_name, role)
        `)
        .or(`and(sender_user_id.eq.${currentUserId},recipient_user_id.eq.${userId}),and(sender_user_id.eq.${userId},recipient_user_id.eq.${currentUserId})`)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setCurrentConversation(messages || []);

      // Mark messages as read
      const unreadMessages = messages?.filter(
        (msg) => msg.recipient_user_id === currentUserId && !msg.read_at
      );

      if (unreadMessages && unreadMessages.length > 0) {
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadMessages.map(msg => msg.id));

        fetchConversations(); // Refresh to update unread counts
      }
    } catch (error) {
      console.error("Error fetching conversation:", error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async (recipientId: string, subject: string | null, body: string) => {
    try {
      if (!currentUserId) return;

      const { error } = await supabase
        .from("messages")
        .insert({
          sender_user_id: currentUserId,
          recipient_user_id: recipientId,
          subject,
          body,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Message sent successfully",
      });

      // Refresh conversation
      await fetchConversationWith(recipientId);
      await fetchConversations();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  return {
    loading,
    conversations,
    currentConversation,
    currentUserId,
    fetchConversationWith,
    sendMessage,
    refetch: fetchConversations,
  };
};
