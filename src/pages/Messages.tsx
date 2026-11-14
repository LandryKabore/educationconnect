import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessageContacts, fetchSentAnnouncements } from "@/lib/scaleApi";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Check, CheckCheck, Loader2, Megaphone, MessageSquare, MessagesSquare, PenSquare, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { AppRole, MessageRow, Profile } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { cn, fullName, joinProfile, matchesSearch } from "@/lib/utils";
import { Button } from "@/components/ui";

type MessageTab = "discussions" | "announcements" | "compose" | "announce";

type MessagesView = "messages" | "annonces";

type ContactRole = "student" | "parent" | "teacher" | "school_admin";

type MessageContact = {
  id: string;
  first_name: string;
  last_name: string;
  role: ContactRole;
  class_name: string | null;
  date_of_birth: string | null;
};

type InboxMessage = MessageRow & {
  sender: { first_name: string; last_name: string } | null;
};

type SentMessage = MessageRow & {
  recipient: { first_name: string; last_name: string } | null;
};

type AnnouncementListItem = {
  key: string;
  message: InboxMessage;
  sentByMe: boolean;
  recipientCount: number;
};

type ChatMessage = MessageRow & {
  direction: "in" | "out";
  otherId: string;
  otherName: string;
};

type Conversation = {
  otherId: string;
  otherName: string;
  messages: ChatMessage[];
  lastMessage: ChatMessage;
  unreadCount: number;
};

const CONTACT_ROLE_OPTIONS: { value: ContactRole | ""; label: string }[] = [
  { value: "", label: "Tous les rôles" },
  { value: "student", label: "Élèves" },
  { value: "parent", label: "Parents" },
  { value: "teacher", label: "Enseignants" },
  { value: "school_admin", label: "Administrateurs" },
];

const ANNOUNCE_ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: "student", label: "Élèves" },
  { value: "parent", label: "Parents" },
  { value: "teacher", label: "Enseignants" },
  { value: "school_admin", label: "Administrateurs" },
];

function formatSeenAt(iso: string) {
  return formatDateSafe(iso, "d MMM yyyy à HH:mm", { locale: fr });
}

function formatConvoTime(iso: string) {
  const date = parseValidDate(iso);
  if (!date) return "—";
  return isToday(date)
    ? formatDateSafe(date, "HH:mm")
    : formatDateSafe(date, "d MMM", { locale: fr });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

function asProfile(raw: unknown): Profile | null {
  return joinProfile<Profile>(raw);
}

function pushContact(
  map: Map<string, MessageContact>,
  profile: Profile | null | undefined,
  role: ContactRole,
  selfId?: string,
  className?: string | null,
) {
  if (!profile?.id || profile.id === selfId) return;
  if (map.has(profile.id)) return;
  map.set(profile.id, {
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    role,
    class_name: className ?? null,
    date_of_birth: profile.date_of_birth ?? null,
  });
}

function formatContactDob(iso: string | null | undefined) {
  if (!iso) return null;
  const formatted = formatDateSafe(iso, "dd/MM/yyyy", { fallback: "" });
  return formatted || null;
}

function contactDisplayName(c: MessageContact) {
  const name = fullName(c.first_name, c.last_name);
  const parts: string[] = [];
  if (c.role === "student" && c.class_name) parts.push(c.class_name);
  parts.push(name);
  const dob = formatContactDob(c.date_of_birth);
  if (c.role === "student" && dob) parts.push(dob);
  return parts.join(" · ");
}

export default function Messages({
  view = "messages",
}: {
  view?: MessagesView;
}) {
  const { user, schoolId, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAnnoncesView = view === "annonces";
  const [tab, setTab] = useState<MessageTab>(
    isAnnoncesView ? "announcements" : "discussions",
  );
  const [selectedOtherId, setSelectedOtherId] = useState<string | null>(null);
  /** When set, chat back arrow returns here (e.g. student profile). */
  const [chatReturnTo, setChatReturnTo] = useState<string | null>(null);
  const [discussionsSearch, setDiscussionsSearch] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [recipientRole, setRecipientRole] = useState<ContactRole | "">("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [ccIds, setCcIds] = useState<string[]>([]);
  const [pickerTarget, setPickerTarget] = useState<"to" | "cc">("to");
  const [contactSearch, setContactSearch] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [noReplies, setNoReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [announceRoles, setAnnounceRoles] = useState<Set<ContactRole>>(
    () => new Set(["student"]),
  );
  const [announceSubject, setAnnounceSubject] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceNoReplies, setAnnounceNoReplies] = useState(true);
  const [announceSending, setAnnounceSending] = useState(false);
  /** batch progress while a message or an announcement is going out */
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const markingRead = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const canControlReplies =
    role === "school_admin" || role === "teacher" || role === "super_admin";

  const canAnnounce = canControlReplies;

  useEffect(() => {
    setTab(isAnnoncesView ? "announcements" : "discussions");
    setSelectedOtherId(null);
    setChatReturnTo(null);
    setDiscussionsSearch("");
    setListSearch("");
  }, [isAnnoncesView]);

  useEffect(() => {
    if (isAnnoncesView) return;
    const avec = searchParams.get("avec");
    if (!avec) return;
    setTab("discussions");
    setSelectedOtherId(avec);
    setDiscussionsSearch("");
    const retour = searchParams.get("retour");
    if (
      retour &&
      retour.startsWith("/") &&
      !retour.startsWith("//")
    ) {
      setChatReturnTo(retour);
    } else {
      setChatReturnTo(null);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("avec");
    next.delete("retour");
    setSearchParams(next, { replace: true });
  }, [isAnnoncesView, searchParams, setSearchParams]);

  const leaveChat = () => {
    if (chatReturnTo) {
      const to = chatReturnTo;
      setChatReturnTo(null);
      setSelectedOtherId(null);
      navigate(to);
      return;
    }
    setSelectedOtherId(null);
  };

  const { data: inbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ["messages-inbox", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, school_id, sender_id, recipient_id, subject, body, read_at, created_at, allow_replies, parent_message_id, is_announcement, announcement_id, is_cc, thread_id, sender:profils!messages_sender_id_fkey(first_name, last_name)",
        )
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as InboxMessage[];
    },
  });

  // Direct messages I sent (newest first; the oldest are dropped past 1,000 - the API limit
  // - instead of the old behaviour where a big announcement used up those 1,000 rows).
  const { data: sent = [], isLoading: sentDirectLoading } = useQuery({
    queryKey: ["messages-sent", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, school_id, sender_id, recipient_id, subject, body, read_at, created_at, allow_replies, parent_message_id, is_announcement, announcement_id, is_cc, thread_id, recipient:profils!messages_recipient_id_fkey(first_name, last_name)",
        )
        .eq("sender_id", user!.id)
        .eq("is_announcement", false)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as SentMessage[];
    },
  });

  // Announcements I sent: one line per announcement with the real number of recipients,
  // counted in SQL (not by counting the rows that happened to be downloaded).
  const { data: sentAnnouncements = [], isLoading: sentAnnLoading } = useQuery({
    queryKey: ["messages-sent", user?.id, "announcements"],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () =>
      (await fetchSentAnnouncements(100)) as unknown as (SentMessage & {
        recipientCount: number;
      })[],
  });
  const sentLoading = sentDirectLoading || sentAnnLoading;

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["message-contacts", schoolId, user?.id, role],
    enabled: !!schoolId && !!user?.id && !!role,
    queryFn: async () => {
      // Admins and teachers: the whole list in one SQL call (a single JSON value, so the
      // 1,000-row API limit does not cut it - the old code lost contacts past 1,000).
      if (role === "school_admin" || role === "super_admin" || role === "teacher") {
        return (await fetchMessageContacts(schoolId!, role)) as MessageContact[];
      }

      const map = new Map<string, MessageContact>();
      const selfId = user!.id;

      if (role === "parent") {
        const { data: links } = await supabase
          .from("liens_parent_eleve")
          .select("student_id")
          .eq("parent_id", selfId);
        const childIds = (links ?? []).map((l) => l.student_id as string);

        if (childIds.length > 0) {
          const { data: enrollments } = await supabase
            .from("inscriptions")
            .select("class_section_id")
            .in("student_id", childIds)
            .eq("status", "active");
          const classIds = [
            ...new Set(
              (enrollments ?? [])
                .map((e) => e.class_section_id as string)
                .filter(Boolean),
            ),
          ];

          if (classIds.length > 0) {
            const { data: aff } = await supabase
              .from("affectations_enseignement")
              .select(
                "teacher_id, profils:profils!affectations_enseignement_teacher_id_fkey(*)",
              )
              .in("class_section_id", classIds);

            for (const row of aff ?? []) {
              pushContact(
                map,
                asProfile((row as { profils: unknown }).profils),
                "teacher",
                selfId,
              );
            }
          }
        }

        const { data: admins } = await supabase
          .from("roles_utilisateurs")
          .select("profils(*)")
          .eq("school_id", schoolId!)
          .eq("role", "school_admin")
          .eq("active", true);

        for (const row of admins ?? []) {
          pushContact(
            map,
            asProfile((row as { profils: unknown }).profils),
            "school_admin",
            selfId,
          );
        }
      } else if (role === "student") {
        const { data: enrollment } = await supabase
          .from("inscriptions")
          .select("class_section_id")
          .eq("student_id", selfId)
          .eq("status", "active")
          .maybeSingle();

        const classId = (enrollment as { class_section_id?: string } | null)
          ?.class_section_id;

        if (classId) {
          const { data: aff } = await supabase
            .from("affectations_enseignement")
            .select(
              "teacher_id, profils:profils!affectations_enseignement_teacher_id_fkey(*)",
            )
            .eq("class_section_id", classId);

          for (const row of aff ?? []) {
            pushContact(
              map,
              asProfile((row as { profils: unknown }).profils),
              "teacher",
              selfId,
            );
          }
        }

        const { data: admins } = await supabase
          .from("roles_utilisateurs")
          .select("profils(*)")
          .eq("school_id", schoolId!)
          .eq("role", "school_admin")
          .eq("active", true);

        for (const row of admins ?? []) {
          pushContact(
            map,
            asProfile((row as { profils: unknown }).profils),
            "school_admin",
            selfId,
          );
        }
      }

      const studentIds = [...map.values()]
        .filter((c) => c.role === "student")
        .map((c) => c.id);
      if (studentIds.length > 0) {
        const { data: enrollments } = await supabase
          .from("inscriptions")
          .select("student_id, classes(name)")
          .eq("status", "active")
          .in("student_id", studentIds);
        for (const row of enrollments ?? []) {
          const r = row as unknown as {
            student_id: string;
            classes?: { name: string } | null;
          };
          const existing = map.get(r.student_id);
          if (existing && r.classes?.name) {
            map.set(r.student_id, {
              ...existing,
              class_name: r.classes.name,
            });
          }
        }
      }

      return [...map.values()].sort((a, b) => {
        const classCmp = (a.class_name ?? "").localeCompare(
          b.class_name ?? "",
          "fr",
        );
        if (classCmp !== 0) return classCmp;
        return fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
        );
      });
    },
  });

  const availableRoleFilters = useMemo(() => {
    const present = new Set(contacts.map((c) => c.role));
    return CONTACT_ROLE_OPTIONS.filter(
      (o) => o.value === "" || present.has(o.value as ContactRole),
    );
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    if (!recipientRole) return contacts;
    return contacts.filter((c) => c.role === recipientRole);
  }, [contacts, recipientRole]);

  const selectedRecipients = useMemo(
    () => contacts.filter((c) => recipientIds.includes(c.id)),
    [contacts, recipientIds],
  );

  const selectedCc = useMemo(
    () => contacts.filter((c) => ccIds.includes(c.id)),
    [contacts, ccIds],
  );

  const pickerExclude = useMemo(() => {
    return new Set(
      role === "student" || pickerTarget === "to" ? ccIds : recipientIds,
    );
  }, [role, pickerTarget, ccIds, recipientIds]);

  const searchedContacts = useMemo(() => {
    return filteredContacts.filter(
      (c) =>
        !pickerExclude.has(c.id) &&
        matchesSearch(
          contactSearch,
          c.first_name,
          c.last_name,
          c.class_name,
          formatContactDob(c.date_of_birth),
          ROLE_LABELS[c.role as AppRole],
        ),
    );
  }, [filteredContacts, contactSearch, pickerExclude]);

  const directInbox = useMemo(
    () => inbox.filter((m) => !m.is_announcement),
    [inbox],
  );
  const announcementInbox = useMemo(
    () => inbox.filter((m) => !!m.is_announcement),
    [inbox],
  );
  const announcementItems = useMemo((): AnnouncementListItem[] => {
    const items: AnnouncementListItem[] = announcementInbox.map((message) => ({
      key: `in-${message.id}`,
      message,
      sentByMe: false,
      recipientCount: 1,
    }));
    for (const a of sentAnnouncements) {
      items.push({
        key: `sent-${a.announcement_id || a.id}`,
        message: { ...a, recipient: undefined, sender: null } as unknown as InboxMessage,
        sentByMe: true,
        recipientCount: Number(a.recipientCount) || 1,
      });
    }

    return items.sort(
      (a, b) =>
        new Date(b.message.created_at).getTime() -
        new Date(a.message.created_at).getTime(),
    );
  }, [announcementInbox, sentAnnouncements]);
  const directSent = useMemo(
    () => sent.filter((m) => !m.is_announcement),
    [sent],
  );

  const filteredAnnouncements = useMemo(() => {
    return announcementItems.filter(({ message: m, sentByMe }) =>
      matchesSearch(
        listSearch,
        m.subject,
        m.body,
        sentByMe ? "Vous" : null,
        m.sender?.first_name,
        m.sender?.last_name,
      ),
    );
  }, [announcementItems, listSearch]);

  const conversations = useMemo((): Conversation[] => {
    const map = new Map<string, ChatMessage[]>();

    for (const m of directInbox) {
      const otherName = fullName(m.sender?.first_name, m.sender?.last_name);
      const list = map.get(m.sender_id) ?? [];
      list.push({ ...m, direction: "in", otherId: m.sender_id, otherName });
      map.set(m.sender_id, list);
    }
    for (const m of directSent) {
      const otherName = fullName(
        m.recipient?.first_name,
        m.recipient?.last_name,
      );
      const list = map.get(m.recipient_id) ?? [];
      list.push({
        ...m,
        direction: "out",
        otherId: m.recipient_id,
        otherName,
      });
      map.set(m.recipient_id, list);
    }

    const result: Conversation[] = [];
    for (const [otherId, msgs] of map) {
      msgs.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const lastMessage = msgs[msgs.length - 1]!;
      const unreadCount = msgs.filter(
        (mm) => mm.direction === "in" && !mm.read_at,
      ).length;
      result.push({
        otherId,
        otherName: lastMessage.otherName,
        messages: msgs,
        lastMessage,
        unreadCount,
      });
    }

    return result.sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime(),
    );
  }, [directInbox, directSent]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) =>
      matchesSearch(
        discussionsSearch,
        c.otherName,
        c.lastMessage.body,
        c.lastMessage.subject,
      ),
    );
  }, [conversations, discussionsSearch]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.otherId === selectedOtherId) ?? null,
    [conversations, selectedOtherId],
  );

  const chatTitle = useMemo(() => {
    if (selectedConversation) return selectedConversation.otherName;
    if (!selectedOtherId) return "";
    const c = contacts.find((x) => x.id === selectedOtherId);
    return c ? fullName(c.first_name, c.last_name) : "Conversation";
  }, [selectedConversation, selectedOtherId, contacts]);

  const announceRoleOptions = useMemo(() => {
    const present = new Set(contacts.map((c) => c.role));
    return ANNOUNCE_ROLE_OPTIONS.filter((o) => present.has(o.value));
  }, [contacts]);

  const announceRecipients = useMemo(() => {
    if (announceRoles.size === 0) return [];
    return contacts.filter((c) => announceRoles.has(c.role));
  }, [contacts, announceRoles]);

  const announceCountByRole = useMemo(() => {
    const counts: Partial<Record<ContactRole, number>> = {};
    for (const c of announceRecipients) {
      counts[c.role] = (counts[c.role] ?? 0) + 1;
    }
    return counts;
  }, [announceRecipients]);

  const toggleAnnounceRole = (r: ContactRole) => {
    setAnnounceRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const invalidateMessages = () => {
    if (!user) return;
    void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
    void qc.invalidateQueries({ queryKey: ["messages-sent", user.id] });
    void qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
  };

  const openChat = (otherId: string) => {
    if (isAnnoncesView) {
      navigate(`/messages?avec=${encodeURIComponent(otherId)}`);
      return;
    }
    setTab("discussions");
    setSelectedOtherId(otherId);
    setDiscussionsSearch("");
  };

  // Live updates: new messages + read receipts without reconnect
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`messages-live:${user.id}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
          void qc.invalidateQueries({ queryKey: ["messages-sent", user.id] });
          void qc.invalidateQueries({
            queryKey: ["messages-unread-count", user.id],
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${user.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
          void qc.invalidateQueries({ queryKey: ["messages-sent", user.id] });
          void qc.invalidateQueries({
            queryKey: ["messages-unread-count", user.id],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  // "Is typing…" — ephemeral broadcast on a channel shared by both participants,
  // nothing written to the DB.
  useEffect(() => {
    setOtherTyping(false);
    if (typingClearRef.current) clearTimeout(typingClearRef.current);
    if (!user?.id || !selectedOtherId) {
      typingChannelRef.current = null;
      return;
    }

    const pairKey = [user.id, selectedOtherId].sort().join(":");
    const channel = supabase
      .channel(`typing:${pairKey}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { userId?: string })?.userId !== selectedOtherId) {
          return;
        }
        setOtherTyping(true);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setOtherTyping(false), 3000);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [user?.id, selectedOtherId]);

  const notifyTyping = () => {
    if (!user?.id || !typingChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    void typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id },
    });
  };

  // Mark unread incoming messages as read when opening a chat thread
  useEffect(() => {
    if (
      tab !== "discussions" ||
      !selectedOtherId ||
      !user ||
      inboxLoading ||
      markingRead.current
    )
      return;
    const unreadIds = (selectedConversation?.messages ?? [])
      .filter((m) => m.direction === "in" && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;

    markingRead.current = true;
    const readAt = new Date().toISOString();
    void (async () => {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: readAt })
        .in("id", unreadIds)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      markingRead.current = false;
      if (error) return;
      qc.setQueryData(
        ["messages-inbox", user.id],
        (prev: InboxMessage[] | undefined) =>
          (prev ?? []).map((m) =>
            unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m,
          ),
      );
      void qc.invalidateQueries({
        queryKey: ["messages-unread-count", user.id],
      });
    })();
  }, [tab, selectedOtherId, user, selectedConversation, inboxLoading, qc]);

  // Mark unread announcements as read when viewing that tab
  useEffect(() => {
    if (tab !== "announcements" || !user || inboxLoading || markingRead.current)
      return;
    const unreadIds = announcementInbox
      .filter((m) => !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;

    markingRead.current = true;
    const readAt = new Date().toISOString();
    void (async () => {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: readAt })
        .in("id", unreadIds)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      markingRead.current = false;
      if (error) return;
      qc.setQueryData(
        ["messages-inbox", user.id],
        (prev: InboxMessage[] | undefined) =>
          (prev ?? []).map((m) =>
            unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m,
          ),
      );
      void qc.invalidateQueries({
        queryKey: ["messages-unread-count", user.id],
      });
    })();
  }, [tab, user, announcementInbox, inboxLoading, qc]);

  // Keep chat scrolled to the latest message
  useEffect(() => {
    if (tab !== "discussions" || !selectedOtherId) return;
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [
    tab,
    selectedOtherId,
    selectedConversation?.messages.length,
    otherTyping,
  ]);

  useEffect(() => {
    if (role !== "student") return;
    setPickerTarget("to");
    setCcIds([]);
    setRecipientRole("");
  }, [role]);

  useEffect(() => {
    if (contacts.length === 0) return;
    const known = new Set(contacts.map((c) => c.id));
    setRecipientIds((prev) => prev.filter((id) => known.has(id)));
    setCcIds((prev) => prev.filter((id) => known.has(id)));
  }, [contacts]);

  const effectivePickerTarget =
    role === "student" ? "to" : pickerTarget;

  const togglePickerId = (id: string) => {
    if (effectivePickerTarget === "to") {
      setRecipientIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      setCcIds((prev) => prev.filter((x) => x !== id));
    } else {
      setCcIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
      setRecipientIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !schoolId || !selectedOtherId) return;
    const text = chatInput.trim();
    if (!text) return;

    setChatSending(true);
    const { error } = await supabase.from("messages").insert({
      school_id: schoolId,
      sender_id: user.id,
      recipient_id: selectedOtherId,
      subject: null,
      body: text,
      allow_replies: true,
      is_announcement: false,
      is_cc: false,
    });
    setChatSending(false);

    if (error) {
      toast.error("Envoi impossible");
      return;
    }
    setChatInput("");
    invalidateMessages();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !schoolId || recipientIds.length === 0) return;
    const text = body.trim();
    if (!text) {
      toast.error("Écrivez le message");
      return;
    }

    setSending(true);
    const threadId = crypto.randomUUID();
    const allowReplies = canControlReplies ? !noReplies : true;
    const subjectText = subject.trim() || null;
    const singleRecipientId =
      recipientIds.length === 1 && ccIds.length === 0 ? recipientIds[0]! : null;
    const payload = [
      ...recipientIds.map((id) => ({
        school_id: schoolId,
        sender_id: user.id,
        recipient_id: id,
        subject: subjectText,
        body: text,
        allow_replies: allowReplies,
        is_announcement: false,
        is_cc: false,
        thread_id: threadId,
      })),
      ...ccIds
        .filter((id) => !recipientIds.includes(id))
        .map((id) => ({
          school_id: schoolId,
          sender_id: user.id,
          recipient_id: id,
          subject: subjectText,
          body: text,
          allow_replies: allowReplies,
          is_announcement: false,
          is_cc: true,
          thread_id: threadId,
        })),
    ];

    const batchSize = 40;
    let sentCount = 0;
    let failed = false;
    setSendProgress({ done: 0, total: payload.length });
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize);
      const { error } = await supabase.from("messages").insert(batch);
      if (error) {
        failed = true;
        break;
      }
      sentCount += batch.length;
      setSendProgress({ done: sentCount, total: payload.length });
    }
    setSendProgress(null);
    setSending(false);

    if (failed && sentCount === 0) {
      toast.error("Envoi impossible");
      return;
    }
    if (failed) {
      toast.message(`Envoi partiel : ${sentCount}/${payload.length}`);
    } else {
      toast.success(
        payload.length === 1
          ? "Message envoyé"
          : `Message envoyé à ${payload.length} personnes`,
      );
    }
    setRecipientIds([]);
    setCcIds([]);
    setRecipientRole("");
    setContactSearch("");
    setPickerTarget("to");
    setSubject("");
    setBody("");
    setNoReplies(false);
    setTab("discussions");
    setSelectedOtherId(singleRecipientId);
    setDiscussionsSearch("");
    invalidateMessages();
  };

  const handleAnnounce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !schoolId) return;
    if (announceRoles.size === 0) {
      toast.error("Choisissez au moins un rôle");
      return;
    }
    if (announceRecipients.length === 0) {
      toast.error("Aucun destinataire pour ces rôles");
      return;
    }
    const text = announceBody.trim();
    if (!text) {
      toast.error("Écrivez le message de l’annonce");
      return;
    }

    setAnnounceSending(true);
    const subjectText =
      announceSubject.trim() ||
      `Annonce — ${format(new Date(), "d MMM yyyy", { locale: fr })}`;
    const announcementId = crypto.randomUUID();
    const payload = announceRecipients.map((c) => ({
      school_id: schoolId,
      sender_id: user.id,
      recipient_id: c.id,
      subject: subjectText,
      body: text,
      allow_replies: !announceNoReplies,
      is_announcement: true,
      announcement_id: announcementId,
    }));

    const batchSize = 40;
    let sentCount = 0;
    let failed = false;
    setSendProgress({ done: 0, total: payload.length });
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize);
      const { error } = await supabase.from("messages").insert(batch);
      if (error) {
        failed = true;
        break;
      }
      sentCount += batch.length;
      setSendProgress({ done: sentCount, total: payload.length });
    }
    setSendProgress(null);
    setAnnounceSending(false);

    if (failed && sentCount === 0) {
      toast.error("Envoi de l’annonce impossible");
      return;
    }
    if (failed) {
      toast.message(
        `Annonce partielle : ${sentCount}/${payload.length} envoyé(s)`,
      );
    } else {
      toast.success(`Annonce envoyée à ${sentCount} personne(s)`);
    }
    setAnnounceSubject("");
    setAnnounceBody("");
    setAnnounceNoReplies(true);
    setTab(isAnnoncesView ? "announcements" : "discussions");
    setSelectedOtherId(null);
    setDiscussionsSearch("");
    invalidateMessages();
  };

  // the announcement open in the reader; on a laptop the newest one opens by itself
  const [selectedAnnKey, setSelectedAnnKey] = useState<string | null>(null);
  const [annFilter, setAnnFilter] = useState<"all" | "received" | "sent">("all");
  useEffect(() => {
    if (!isAnnoncesView || selectedAnnKey || announcementItems.length === 0) return;
    if (window.matchMedia("(min-width: 1024px)").matches) setSelectedAnnKey(announcementItems[0]!.key);
  }, [isAnnoncesView, selectedAnnKey, announcementItems]);

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const contactLine = (id: string | null) => {
    const c = id ? contactById.get(id) : undefined;
    if (!c) return "";
    return [ROLE_LABELS[c.role as AppRole] ?? c.role, c.class_name].filter(Boolean).join(" · ");
  };
  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);
  const unreadAnnouncements = announcementInbox.filter((m) => !m.read_at).length;
  const shownAnnouncements = filteredAnnouncements.filter((a) =>
    annFilter === "all" ? true : annFilter === "sent" ? a.sentByMe : !a.sentByMe,
  );
  const selectedAnn = announcementItems.find((a) => a.key === selectedAnnKey) ?? null;
  const composing = tab === "compose" || tab === "announce";

  // chat messages grouped by day, for the separators
  const chatDays: { key: string; label: string; items: ChatMessage[] }[] = [];
  for (const m of selectedConversation?.messages ?? []) {
    const d = parseValidDate(m.created_at);
    const key = d ? format(d, "yyyy-MM-dd") : "?";
    const last = chatDays[chatDays.length - 1];
    if (last && last.key === key) last.items.push(m);
    else chatDays.push({ key, label: d ? dayLabel(d) : "", items: [m] });
  }

  const startCompose = () => {
    setTab("compose");
    setSelectedOtherId(null);
    setContactSearch("");
  };
  const closeCompose = () => setTab(isAnnoncesView ? "announcements" : "discussions");

  const inputCls =
    "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-[var(--border)] dark:bg-[var(--surface)]";
  const searchCls =
    "h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white dark:border-[var(--border)] dark:bg-[var(--surface-2)]";
  const fieldLabel = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500";

  /* ------------------------------------------------------------------ compose: message */
  const composeMessage = (
    <form onSubmit={(e) => void handleSend(e)} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-[var(--border)]">
        <button
          type="button"
          onClick={closeCompose}
          aria-label="Fermer"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-[var(--surface-2)]"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-slate-50">Nouveau message</p>
          <p className="text-xs text-slate-500">
            {role === "teacher"
              ? "Vos élèves, leurs parents et l’administration"
              : role === "student"
                ? "Vos professeurs et l’administration"
                : "Élèves, parents, enseignants et administrateurs de l’école"}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {/* recipients */}
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className={fieldLabel}>Destinataires</span>
            {role !== "student" ? (
              <div className="inline-flex rounded-md bg-slate-100 p-0.5 dark:bg-[var(--surface-2)]">
                {(["to", "cc"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPickerTarget(t)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-bold transition",
                      pickerTarget === t
                        ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                        : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {t === "to" ? `À (${recipientIds.length})` : `Copie (${ccIds.length})`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedRecipients.length + selectedCc.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selectedRecipients.map((c) => (
                <RecipientChip
                  key={c.id}
                  label={contactDisplayName(c)}
                  tone="brand"
                  onRemove={() => setRecipientIds((prev) => prev.filter((x) => x !== c.id))}
                />
              ))}
              {selectedCc.map((c) => (
                <RecipientChip
                  key={c.id}
                  label={`Cc · ${contactDisplayName(c)}`}
                  tone="slate"
                  onRemove={() => setCcIds((prev) => prev.filter((x) => x !== c.id))}
                />
              ))}
            </div>
          ) : (
            <p className="mb-3 text-xs text-slate-500">
              {effectivePickerTarget === "to" ? "Choisissez une ou plusieurs personnes." : "Optionnel : personnes en copie."}
            </p>
          )}

          <div className="rounded-md border border-slate-200 dark:border-[var(--border)]">
            <div className="space-y-2 border-b border-slate-100 p-2.5 dark:border-[var(--border)]">
              {role !== "student" && availableRoleFilters.length > 2 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availableRoleFilters.map((o) => (
                    <button
                      key={o.value || "all"}
                      type="button"
                      onClick={() => {
                        setRecipientRole(o.value as ContactRole | "");
                        setContactSearch("");
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-semibold ring-1 transition",
                        recipientRole === o.value
                          ? "bg-brand-700 text-white ring-brand-700"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-[var(--surface)] dark:text-slate-300 dark:ring-[var(--border)]",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Nom, classe…"
                  disabled={contactsLoading || filteredContacts.length === 0}
                  className={searchCls}
                />
              </label>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {contactsLoading ? (
                <p className="px-3 py-3 text-sm text-slate-500">Chargement…</p>
              ) : searchedContacts.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">
                  {filteredContacts.length === 0 ? "Aucun contact disponible" : "Aucun résultat"}
                </p>
              ) : (
                searchedContacts.map((c) => {
                  const picked = effectivePickerTarget === "to" ? recipientIds.includes(c.id) : ccIds.includes(c.id);
                  const name = fullName(c.first_name, c.last_name);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => togglePickerId(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 dark:border-[var(--border)]",
                        picked ? "bg-brand-50 dark:bg-brand-950/30" : "hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          picked ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white dark:bg-transparent",
                        )}
                      >
                        {picked ? <Check className="h-3.5 w-3.5" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[ROLE_LABELS[c.role as AppRole] ?? c.role, c.class_name, c.role === "student" ? formatContactDob(c.date_of_birth) : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section>
          <label htmlFor="msg-subject" className={fieldLabel}>
            Objet
          </label>
          <input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Facultatif" className={inputCls} />
        </section>

        <section>
          <label htmlFor="msg-body" className={fieldLabel}>
            Message
          </label>
          <textarea
            id="msg-body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            placeholder="Écrivez votre message…"
            className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-[var(--border)] dark:bg-[var(--surface)]"
          />
        </section>

        {canControlReplies ? (
          <ToggleRow
            checked={noReplies}
            onChange={setNoReplies}
            title="Personne ne peut répondre"
            hint="Utile pour une observation ou une information officielle."
          />
        ) : null}
      </div>

      {sendProgress ? <SendProgressBar done={sendProgress.done} total={sendProgress.total} /> : null}
      <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-[var(--border)]">
        <Button type="button" variant="ghost" onClick={closeCompose} disabled={!!sendProgress}>
          Annuler
        </Button>
        <Button type="submit" disabled={sending || recipientIds.length === 0 || filteredContacts.length === 0}>
          <Send className="h-4 w-4" />
          {sending
            ? sendProgress && sendProgress.total > 1
              ? `Envoi… ${sendProgress.done} / ${sendProgress.total}`
              : "Envoi…"
            : recipientIds.length + ccIds.length > 1
              ? `Envoyer à ${recipientIds.length + ccIds.length} personnes`
              : "Envoyer"}
        </Button>
      </footer>
    </form>
  );

  /* ------------------------------------------------------------------ compose: announcement */
  const composeAnnouncement = (
    <form onSubmit={(e) => void handleAnnounce(e)} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-[var(--border)]">
        <button
          type="button"
          onClick={closeCompose}
          aria-label="Fermer"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-[var(--surface-2)]"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-slate-50">Nouvelle annonce</p>
          <p className="text-xs text-slate-500">
            {role === "teacher"
              ? "Vos élèves, leurs parents et l’administration, selon votre choix"
              : "Toute l’école, pour les rôles choisis"}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <span className={fieldLabel}>Qui reçoit l’annonce ?</span>
          {announceRoleOptions.length === 0 ? (
            <p className="text-sm text-amber-700">Aucun contact disponible pour une annonce.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {announceRoleOptions.map((o) => {
                const checked = announceRoles.has(o.value);
                const count = contacts.filter((c) => c.role === o.value).length;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleAnnounceRole(o.value)}
                    aria-pressed={checked}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition",
                      checked
                        ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600/20 dark:bg-brand-950/30"
                        : "border-slate-200 hover:bg-slate-50 dark:border-[var(--border)] dark:hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        checked ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300",
                      )}
                    >
                      {checked ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{o.label}</span>
                    <span className="text-xs font-semibold tabular-nums text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {announceRecipients.length > 0 ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              <strong className="text-brand-800 dark:text-brand-200">{announceRecipients.length}</strong> destinataire
              {announceRecipients.length > 1 ? "s" : ""}
              {Object.entries(announceCountByRole)
                .map(([r, n]) => ` · ${n} ${ROLE_LABELS[r as AppRole]?.toLowerCase() ?? r}`)
                .join("")}
            </p>
          ) : null}
        </section>

        <section>
          <label htmlFor="ann-subject" className={fieldLabel}>
            Objet
          </label>
          <input
            id="ann-subject"
            value={announceSubject}
            onChange={(e) => setAnnounceSubject(e.target.value)}
            placeholder="ex. Réunion des parents, vendredi"
            className={inputCls}
          />
        </section>

        <section>
          <label htmlFor="ann-body" className={fieldLabel}>
            Annonce
          </label>
          <textarea
            id="ann-body"
            rows={7}
            value={announceBody}
            onChange={(e) => setAnnounceBody(e.target.value)}
            required
            placeholder="Texte de l’annonce…"
            className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-[var(--border)] dark:bg-[var(--surface)]"
          />
        </section>

        <ToggleRow
          checked={announceNoReplies}
          onChange={setAnnounceNoReplies}
          title="Personne ne peut répondre"
          hint="Recommandé pour les annonces officielles."
        />
      </div>

      {sendProgress ? <SendProgressBar done={sendProgress.done} total={sendProgress.total} /> : null}
      <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-[var(--border)]">
        <Button type="button" variant="ghost" onClick={closeCompose} disabled={!!sendProgress}>
          Annuler
        </Button>
        <Button type="submit" disabled={announceSending || announceRecipients.length === 0 || announceRoles.size === 0}>
          <Megaphone className="h-4 w-4" />
          {announceSending
            ? sendProgress
              ? `Envoi… ${sendProgress.done} / ${sendProgress.total}`
              : "Envoi…"
            : `Envoyer l’annonce (${announceRecipients.length})`}
        </Button>
      </footer>
    </form>
  );

  /* ------------------------------------------------------------------ chat */
  const chatPane = (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-[var(--border)]">
        <button
          type="button"
          onClick={leaveChat}
          aria-label={chatReturnTo ? "Retour au profil élève" : "Retour aux discussions"}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--surface-2)]",
            !chatReturnTo && "lg:hidden",
          )}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Initials name={chatTitle} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900 dark:text-slate-50">{chatTitle}</p>
          <p className={cn("truncate text-xs", otherTyping ? "font-semibold text-brand-700" : "text-slate-500")}>
            {otherTyping ? "en train d’écrire…" : contactLine(selectedOtherId) || " "}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-6 dark:bg-[var(--surface-2)]">
        {chatDays.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nouvelle discussion</p>
            <p className="mt-1 text-xs text-slate-500">Écrivez votre premier message à {chatTitle}.</p>
          </div>
        ) : (
          chatDays.map((day) => (
            <div key={day.key} className="space-y-1.5">
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:ring-[var(--border)]">
                  {day.label}
                </span>
              </div>
              {day.items.map((m, i) => {
                const mine = m.direction === "out";
                const grouped = day.items[i - 1]?.direction === m.direction;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start", !grouped && "pt-2")}>
                    <div className={cn("flex max-w-[75%] flex-col", mine ? "items-end" : "items-start")}>
                      {m.subject ? (
                        <span className="mb-1 max-w-full truncate px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          {m.subject}
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          "rounded-lg px-3.5 py-2 text-sm",
                          mine
                            ? "bg-brand-700 text-white"
                            : "bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:text-slate-100 dark:ring-[var(--border)]",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/70" : "text-slate-400")}>
                          {m.is_cc ? <span className="rounded bg-black/10 px-1 font-semibold">Cc</span> : null}
                          <span>{formatDateSafe(m.created_at, "HH:mm")}</span>
                          {mine ? (
                            m.read_at ? (
                              <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label={`Vu le ${formatSeenAt(m.read_at)}`} />
                            ) : (
                              <Check className="h-3.5 w-3.5" aria-label="Envoyé" />
                            )
                          ) : null}
                        </div>
                      </div>
                      {m.allow_replies === false ? (
                        <span className="mt-1 max-w-full px-1 text-[10px] italic text-slate-400">Réponses désactivées pour ce message</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {otherTyping ? (
          <div className="flex justify-start pt-2">
            <div className="flex items-center gap-1 rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:ring-[var(--border)]">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={(e) => void handleSendChat(e)} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-[var(--border)]">
        <textarea
          rows={1}
          value={chatInput}
          onChange={(e) => {
            setChatInput(e.target.value);
            notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={`Écrire à ${chatTitle}…`}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition [field-sizing:content] focus:border-brand-500 focus:bg-white dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
        />
        <button
          type="submit"
          disabled={chatSending || !chatInput.trim()}
          aria-label="Envoyer"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md bg-brand-700 text-white transition hover:bg-brand-800 disabled:opacity-40"
        >
          {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </>
  );

  /* ------------------------------------------------------------------ announcement reader */
  const annReader = selectedAnn ? (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 lg:hidden dark:border-[var(--border)]">
        <button
          type="button"
          onClick={() => setSelectedAnnKey(null)}
          aria-label="Retour aux annonces"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-slate-700">Annonces</span>
      </div>
      <article className="mx-auto max-w-2xl px-6 py-8 lg:px-10">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
          <Megaphone className="h-3 w-3" />
          {selectedAnn.sentByMe ? "Annonce envoyée" : "Annonce officielle"}
        </span>
        <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-slate-900 lg:text-[1.75rem] dark:text-slate-50">
          {selectedAnn.message.subject || "(Sans objet)"}
        </h2>
        <div className="mt-4 flex items-center gap-3 border-b border-slate-200 pb-5 dark:border-[var(--border)]">
          <Initials name={selectedAnn.sentByMe ? "Vous" : annSender(selectedAnn)} size="sm" tone="slate" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedAnn.sentByMe
                ? `Vous · envoyée à ${selectedAnn.recipientCount} destinataire${selectedAnn.recipientCount > 1 ? "s" : ""}`
                : annSender(selectedAnn)}
            </p>
            <p className="text-xs text-slate-500">{capitalize(formatDateSafe(selectedAnn.message.created_at, "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }))}</p>
          </div>
        </div>
        <p className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
          {selectedAnn.message.body}
        </p>
        <div className="mt-8 border-t border-slate-200 pt-5 dark:border-[var(--border)]">
          {selectedAnn.sentByMe ? (
            <p className="text-sm text-slate-500">
              {selectedAnn.message.allow_replies === false ? "Les destinataires ne peuvent pas répondre." : "Les destinataires peuvent vous répondre."}
            </p>
          ) : selectedAnn.message.allow_replies !== false ? (
            <Button type="button" onClick={() => openChat(selectedAnn.message.sender_id)}>
              <MessageSquare className="h-4 w-4" />
              Répondre
            </Button>
          ) : (
            <p className="text-sm text-slate-500">Cette annonce n’accepte pas de réponse.</p>
          )}
        </div>
      </article>
    </div>
  ) : null;

  /* ------------------------------------------------------------------ layout */
  const listOpenOnMobile = isAnnoncesView ? !selectedAnnKey && !composing : !selectedOtherId && !composing;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]">
      <aside
        className={cn(
          "w-full flex-col border-r border-slate-200 lg:flex lg:w-[350px] lg:shrink-0 dark:border-[var(--border)]",
          listOpenOnMobile ? "flex" : "hidden",
        )}
      >
        <div className="border-b border-slate-200 px-4 pb-3 pt-4 dark:border-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {isAnnoncesView ? "Annonces" : "Messages"}
              </h1>
              <p className="text-xs text-slate-500">
                {isAnnoncesView
                  ? unreadAnnouncements > 0
                    ? `${unreadAnnouncements} nouvelle${unreadAnnouncements > 1 ? "s" : ""}`
                    : "Informations officielles de l’établissement"
                  : totalUnread > 0
                    ? `${totalUnread} message${totalUnread > 1 ? "s" : ""} non lu${totalUnread > 1 ? "s" : ""}`
                    : "Tout est lu"}
              </p>
            </div>
            {isAnnoncesView ? (
              canAnnounce ? (
                <button
                  type="button"
                  onClick={() => setTab("announce")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white transition hover:bg-brand-800"
                >
                  <Megaphone className="h-4 w-4" />
                  Nouvelle
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={startCompose}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white transition hover:bg-brand-800"
              >
                <PenSquare className="h-4 w-4" />
                Écrire
              </button>
            )}
          </div>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={isAnnoncesView ? listSearch : discussionsSearch}
              onChange={(e) => (isAnnoncesView ? setListSearch(e.target.value) : setDiscussionsSearch(e.target.value))}
              placeholder={isAnnoncesView ? "Expéditeur, objet, contenu…" : "Rechercher une discussion…"}
              className={searchCls}
            />
          </label>
          {isAnnoncesView && canAnnounce ? (
            <div className="mt-2 grid grid-cols-3 rounded-md bg-slate-100 p-0.5 dark:bg-[var(--surface-2)]">
              {(
                [
                  ["all", "Toutes"],
                  ["received", "Reçues"],
                  ["sent", "Envoyées"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAnnFilter(key)}
                  className={cn(
                    "rounded px-2 py-1.5 text-xs font-semibold transition",
                    annFilter === key
                      ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isAnnoncesView ? (
            inboxLoading || sentLoading ? (
              <p className="p-6 text-center text-sm text-slate-500">Chargement…</p>
            ) : announcementItems.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Aucune annonce pour le moment.</p>
            ) : shownAnnouncements.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Aucun résultat.</p>
            ) : (
              shownAnnouncements.map((a) => {
                const active = a.key === selectedAnnKey && !composing;
                const unread = !a.sentByMe && !a.message.read_at;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      setSelectedAnnKey(a.key);
                      setTab("announcements");
                    }}
                    className={cn(
                      "flex w-full gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-3 text-left transition dark:border-b-[var(--border)]",
                      active ? "border-l-brand-700 bg-brand-50 dark:bg-brand-900/30" : "border-l-transparent hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <span className="mt-1.5 flex w-2 shrink-0 justify-center">
                      {unread ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-slate-500">
                          {a.sentByMe ? `Vous · ${a.recipientCount} destinataire${a.recipientCount > 1 ? "s" : ""}` : annSender(a)}
                        </span>
                        <span className={cn("shrink-0 text-[11px]", unread ? "font-bold text-brand-700" : "text-slate-400")}>
                          {formatConvoTime(a.message.created_at)}
                        </span>
                      </span>
                      <span className={cn("mt-0.5 block truncate text-sm text-slate-900 dark:text-slate-100", unread ? "font-bold" : "font-semibold")}>
                        {a.message.subject || "(Sans objet)"}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.message.body}</span>
                    </span>
                  </button>
                );
              })
            )
          ) : inboxLoading || sentLoading ? (
            <p className="p-6 text-center text-sm text-slate-500">Chargement…</p>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aucune discussion</p>
              <p className="mt-1 text-xs text-slate-500">Cliquez sur « Écrire » pour lancer une conversation.</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Aucun résultat.</p>
          ) : (
            filteredConversations.map((c) => {
              const active = c.otherId === selectedOtherId && tab === "discussions";
              const unread = c.unreadCount > 0;
              const line = contactLine(c.otherId);
              return (
                <button
                  key={c.otherId}
                  type="button"
                  onClick={() => openChat(c.otherId)}
                  className={cn(
                    "flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition",
                    active ? "border-brand-700 bg-brand-50 dark:bg-brand-900/30" : "border-transparent hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                  )}
                >
                  <Initials name={c.otherName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm text-slate-900 dark:text-slate-100", unread ? "font-bold" : "font-semibold")}>
                        {c.otherName}
                      </span>
                      <span className={cn("shrink-0 text-[11px]", unread ? "font-bold text-brand-700 dark:text-brand-300" : "text-slate-400")}>
                        {formatConvoTime(c.lastMessage.created_at)}
                      </span>
                    </span>
                    {line ? <span className="block truncate text-[11px] font-medium text-slate-400">{line}</span> : null}
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-xs", unread ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-500")}>
                        {c.lastMessage.direction === "out" ? "Vous : " : ""}
                        {c.lastMessage.body}
                      </span>
                      {unread ? (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-brand-700 px-1.5 text-[11px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", listOpenOnMobile ? "hidden lg:flex" : "flex")}>
        {tab === "compose" ? (
          composeMessage
        ) : tab === "announce" && canAnnounce ? (
          composeAnnouncement
        ) : isAnnoncesView ? (
          annReader ?? (
            <EmptyPane
              icon={Megaphone}
              title={announcementItems.length ? "Choisissez une annonce" : "Aucune annonce"}
              text="Les informations de l’établissement arrivent ici."
              action={canAnnounce ? { label: "Nouvelle annonce", onClick: () => setTab("announce") } : undefined}
            />
          )
        ) : selectedOtherId ? (
          chatPane
        ) : (
          <EmptyPane
            icon={MessagesSquare}
            title="Vos discussions"
            text="Choisissez une discussion à gauche, ou écrivez à quelqu’un."
            action={{ label: "Nouveau message", onClick: startCompose }}
          />
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function dayLabel(d: Date) {
  if (isToday(d)) return "Aujourd’hui";
  if (isYesterday(d)) return "Hier";
  return capitalize(format(d, "EEEE d MMMM", { locale: fr }));
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function annSender(a: AnnouncementListItem) {
  return fullName(a.message.sender?.first_name, a.message.sender?.last_name) || "L’établissement";
}

function Initials({ name, size = "md", tone = "brand" }: { name: string; size?: "sm" | "md"; tone?: "brand" | "slate" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-bold",
        size === "md" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs",
        tone === "brand" ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-700",
      )}
    >
      {initials(name)}
    </span>
  );
}

function RecipientChip({ label, tone, onRemove }: { label: string; tone: "brand" | "slate"; onRemove: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md py-1 pl-2.5 pr-1 text-xs font-semibold",
        tone === "brand" ? "bg-brand-50 text-brand-900 ring-1 ring-brand-200" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
      )}
    >
      {label}
      <button type="button" onClick={onRemove} aria-label="Retirer" className="rounded p-0.5 hover:bg-black/10">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-[var(--border)] dark:hover:bg-[var(--surface-2)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand-700" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function EmptyPane({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Megaphone;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 p-8 text-center dark:bg-[var(--surface-2)]">
      <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
        <Icon className="h-7 w-7" />
      </span>
      <p className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-50">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action ? (
        <Button type="button" className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/** Progress of a send: batches of 40, so the bar shows the real count. */
function SendProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="border-t border-slate-200 px-5 pt-3 dark:border-[var(--border)]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Envoi en cours">
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 text-brand-800 dark:text-brand-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Envoi en cours…
        </span>
        <span className="tabular-nums text-slate-500">
          {total > 1 ? `${done.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")} · ` : ""}
          {pct} %
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-slate-100 dark:bg-[var(--surface-2)]">
        <div
          className={cn("h-full rounded-sm bg-brand-600 transition-all duration-300", done === 0 && "animate-pulse")}
          style={{ width: `${Math.max(pct, 6)}%` }}
        />
      </div>
    </div>
  );
}
