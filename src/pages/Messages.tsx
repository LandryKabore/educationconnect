import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AppRole, MessageRow, Profile } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { cn, fullName, matchesSearch } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

type MessageTab = "discussions" | "announcements" | "compose" | "announce";

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
  return format(new Date(iso), "d MMM yyyy à HH:mm", { locale: fr });
}

function formatConvoTime(iso: string) {
  const date = new Date(iso);
  return isToday(date)
    ? format(date, "HH:mm")
    : format(date, "d MMM", { locale: fr });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

function asProfile(raw: unknown): Profile | null {
  return (raw as Profile | null) ?? null;
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
  try {
    return format(new Date(iso), "dd/MM/yyyy");
  } catch {
    return null;
  }
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

export default function Messages() {
  const { user, schoolId, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<MessageTab>("discussions");
  const [selectedOtherId, setSelectedOtherId] = useState<string | null>(null);
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
  const markingRead = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const canControlReplies =
    role === "school_admin" || role === "teacher" || role === "super_admin";

  const canAnnounce = canControlReplies;

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
      return data as InboxMessage[];
    },
  });

  const { data: sent = [], isLoading: sentLoading } = useQuery({
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SentMessage[];
    },
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["message-contacts", schoolId, user?.id, role],
    enabled: !!schoolId && !!user?.id && !!role,
    queryFn: async () => {
      const map = new Map<string, MessageContact>();
      const selfId = user!.id;

      if (role === "school_admin" || role === "super_admin") {
        const { data: roles } = await supabase
          .from("roles_utilisateurs")
          .select("user_id, role, profils(*)")
          .eq("school_id", schoolId!)
          .eq("active", true)
          .in("role", ["student", "parent", "teacher", "school_admin"]);

        for (const row of roles ?? []) {
          const r = row as unknown as {
            role: ContactRole;
            profils: Profile | null;
          };
          if (
            r.role === "student" ||
            r.role === "parent" ||
            r.role === "teacher" ||
            r.role === "school_admin"
          ) {
            pushContact(map, r.profils, r.role, selfId);
          }
        }
      } else if (role === "teacher") {
        const { data: aff } = await supabase
          .from("affectations_enseignement")
          .select("class_section_id")
          .eq("teacher_id", selfId);
        const classIds = [
          ...new Set(
            (aff ?? []).map((a) => a.class_section_id as string).filter(Boolean),
          ),
        ];

        if (classIds.length > 0) {
          const { data: enrollments } = await supabase
            .from("inscriptions")
            .select(
              "student_id, profils:profils!inscriptions_student_id_fkey(*)",
            )
            .in("class_section_id", classIds)
            .eq("status", "active");

          const studentIds: string[] = [];
          for (const row of enrollments ?? []) {
            const r = row as unknown as {
              student_id: string;
              profils: Profile | null;
            };
            studentIds.push(r.student_id);
            pushContact(map, r.profils, "student", selfId);
          }

          if (studentIds.length > 0) {
            const { data: links } = await supabase
              .from("liens_parent_eleve")
              .select(
                "parent_id, profils:profils!liens_parent_eleve_parent_id_fkey(*)",
              )
              .in("student_id", studentIds);

            for (const row of links ?? []) {
              const r = row as unknown as {
                profils: Profile | null;
              };
              pushContact(map, r.profils, "parent", selfId);
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
      } else if (role === "parent") {
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
    return new Set(pickerTarget === "to" ? ccIds : recipientIds);
  }, [pickerTarget, ccIds, recipientIds]);

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
  const directSent = useMemo(
    () => sent.filter((m) => !m.is_announcement),
    [sent],
  );

  const filteredAnnouncements = useMemo(() => {
    return announcementInbox.filter((m) =>
      matchesSearch(
        listSearch,
        m.subject,
        m.body,
        m.sender?.first_name,
        m.sender?.last_name,
      ),
    );
  }, [announcementInbox, listSearch]);

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
    setTab("discussions");
    setSelectedOtherId(otherId);
    setDiscussionsSearch("");
  };

  // Live updates: new messages + read receipts without reconnect
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`messages-live:${user.id}`)
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
  }, [tab, selectedOtherId, selectedConversation?.messages.length]);

  useEffect(() => {
    if (contacts.length === 0) return;
    const known = new Set(contacts.map((c) => c.id));
    setRecipientIds((prev) => prev.filter((id) => known.has(id)));
    setCcIds((prev) => prev.filter((id) => known.has(id)));
  }, [contacts]);

  const togglePickerId = (id: string) => {
    if (pickerTarget === "to") {
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
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize);
      const { error } = await supabase.from("messages").insert(batch);
      if (error) {
        failed = true;
        break;
      }
      sentCount += batch.length;
    }
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
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize);
      const { error } = await supabase.from("messages").insert(batch);
      if (error) {
        failed = true;
        break;
      }
      sentCount += batch.length;
    }
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
    setTab("discussions");
    setSelectedOtherId(null);
    setDiscussionsSearch("");
    invalidateMessages();
  };

  return (
    <div>
      <PageHeader
        title="Messages"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "discussions" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setTab("discussions");
                setSelectedOtherId(null);
                setDiscussionsSearch("");
              }}
            >
              Discussions
            </Button>
            <Button
              variant={tab === "announcements" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setTab("announcements");
                setListSearch("");
              }}
            >
              Annonces
            </Button>
            <Button
              variant={tab === "compose" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setTab("compose");
                setContactSearch("");
              }}
            >
              Nouveau message
            </Button>
            {canAnnounce ? (
              <Button
                variant={tab === "announce" ? "primary" : "outline"}
                size="sm"
                onClick={() => setTab("announce")}
              >
                Envoyer une annonce
              </Button>
            ) : null}
          </div>
        }
      />

      {tab === "announce" && canAnnounce ? (
        <Card className="max-w-4xl">
          <form onSubmit={(e) => void handleAnnounce(e)} className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Destinataires (rôles)
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {role === "teacher"
                  ? "Vos élèves, leurs parents, et l’administration (selon votre sélection)."
                  : "Toute l’école pour les rôles cochés."}
              </p>
              {announceRoleOptions.length === 0 ? (
                <p className="mt-2 text-sm text-amber-700">
                  Aucun contact disponible pour une annonce.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {announceRoleOptions.map((o) => {
                    const checked = announceRoles.has(o.value);
                    const count = contacts.filter(
                      (c) => c.role === o.value,
                    ).length;
                    return (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={checked}
                          onChange={() => toggleAnnounceRole(o.value)}
                        />
                        <span className="flex-1 font-medium">{o.label}</span>
                        <span className="text-xs text-slate-500">
                          {count} personne{count !== 1 ? "s" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {announceRecipients.length > 0 ? (
                <p className="mt-2 text-sm text-brand-800">
                  Total : <strong>{announceRecipients.length}</strong> destinataire
                  {announceRecipients.length !== 1 ? "s" : ""}
                  {Object.entries(announceCountByRole)
                    .map(
                      ([r, n]) =>
                        ` · ${n} ${ROLE_LABELS[r as AppRole]?.toLowerCase() ?? r}`,
                    )
                    .join("")}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Objet</Label>
              <Input
                value={announceSubject}
                onChange={(e) => setAnnounceSubject(e.target.value)}
                placeholder="ex. Réunion parents — vendredi"
              />
            </div>
            <div>
              <Label>Annonce</Label>
              <Textarea
                value={announceBody}
                onChange={(e) => setAnnounceBody(e.target.value)}
                required
                placeholder="Texte de l’annonce…"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                checked={announceNoReplies}
                onChange={(e) => setAnnounceNoReplies(e.target.checked)}
              />
              <span>
                Personne ne peut répondre
                <span className="mt-0.5 block text-xs text-slate-500">
                  Recommandé pour les annonces officielles.
                </span>
              </span>
            </label>
            <Button
              type="submit"
              disabled={
                announceSending ||
                announceRecipients.length === 0 ||
                announceRoles.size === 0
              }
            >
              {announceSending
                ? "Envoi…"
                : `Envoyer l’annonce (${announceRecipients.length})`}
            </Button>
          </form>
        </Card>
      ) : tab === "compose" ? (
        <Card className="max-w-4xl">
          <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
            <div>
              <Label>Type de destinataire</Label>
              <Select
                value={recipientRole}
                onChange={(e) => {
                  setRecipientRole(e.target.value as ContactRole | "");
                  setContactSearch("");
                }}
              >
                {availableRoleFilters.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={pickerTarget === "to" ? "primary" : "outline"}
                  onClick={() => setPickerTarget("to")}
                >
                  À ({recipientIds.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pickerTarget === "cc" ? "primary" : "outline"}
                  onClick={() => setPickerTarget("cc")}
                >
                  Cc ({ccIds.length})
                </Button>
              </div>
              <Label>
                {pickerTarget === "to" ? "Destinataires" : "Cc (copie)"}
              </Label>
              {selectedRecipients.length > 0 ? (
                <div className="mb-2">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    À
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRecipients.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs text-brand-950"
                      >
                        {contactDisplayName(c)}
                        <button
                          type="button"
                          className="font-medium text-brand-700 hover:text-brand-900"
                          onClick={() =>
                            setRecipientIds((prev) =>
                              prev.filter((id) => id !== c.id),
                            )
                          }
                          aria-label="Retirer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedCc.length > 0 ? (
                <div className="mb-2">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Cc
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCc.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800"
                      >
                        {contactDisplayName(c)}
                        <button
                          type="button"
                          className="font-medium text-slate-600 hover:text-slate-900"
                          onClick={() =>
                            setCcIds((prev) => prev.filter((id) => id !== c.id))
                          }
                          aria-label="Retirer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedRecipients.length === 0 && selectedCc.length === 0 ? (
                <p className="mb-2 text-xs text-slate-500">
                  {pickerTarget === "to"
                    ? "Sélectionnez une ou plusieurs personnes."
                    : "Optionnel — personnes en copie."}
                </p>
              ) : null}
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Rechercher un nom…"
                className="mb-2"
                disabled={contactsLoading || filteredContacts.length === 0}
              />
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                {contactsLoading ? (
                  <p className="px-3 py-2 text-sm text-slate-500">Chargement…</p>
                ) : searchedContacts.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">
                    {filteredContacts.length === 0
                      ? "Aucun contact disponible"
                      : "Aucun résultat pour cette recherche"}
                  </p>
                ) : (
                  searchedContacts.map((c) => {
                    const selected =
                      pickerTarget === "to"
                        ? recipientIds.includes(c.id)
                        : ccIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => togglePickerId(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0",
                          selected
                            ? "bg-brand-50 font-medium text-brand-950"
                            : "hover:bg-slate-50",
                        )}
                      >
                        <span className="min-w-0 truncate">
                          {contactDisplayName(c)}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {selected ? "✓ " : ""}
                          {ROLE_LABELS[c.role as AppRole] ?? c.role}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {role === "teacher" ? (
                <p className="mt-1 text-xs text-slate-500">
                  Élèves de vos classes, leurs parents, et l’administration.
                </p>
              ) : role === "school_admin" || role === "super_admin" ? (
                <p className="mt-1 text-xs text-slate-500">
                  Élèves, parents, enseignants et administrateurs de l’école.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Objet</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>
            {canControlReplies ? (
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  checked={noReplies}
                  onChange={(e) => setNoReplies(e.target.checked)}
                />
                <span>
                  Personne ne peut répondre
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Utile pour une observation ou une info officielle.
                  </span>
                </span>
              </label>
            ) : null}
            <Button
              type="submit"
              disabled={
                sending ||
                recipientIds.length === 0 ||
                filteredContacts.length === 0
              }
            >
              {sending
                ? "Envoi…"
                : recipientIds.length + ccIds.length > 1
                  ? `Envoyer (${recipientIds.length + ccIds.length})`
                  : "Envoyer"}
            </Button>
          </form>
        </Card>
      ) : tab === "announcements" ? (
        inboxLoading ? (
          <p className="text-slate-500">Chargement…</p>
        ) : announcementInbox.length === 0 ? (
          <EmptyState message="Aucune annonce pour le moment." />
        ) : (
          <div className="space-y-3">
            <div className="max-w-md">
              <Label htmlFor="search-announcements">Rechercher</Label>
              <Input
                id="search-announcements"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Expéditeur, objet, contenu…"
              />
            </div>
            {filteredAnnouncements.length === 0 ? (
              <EmptyState message="Aucune annonce ne correspond à la recherche." />
            ) : (
              filteredAnnouncements.map((m) => {
                const canReply = m.allow_replies !== false;
                return (
                  <Card
                    key={m.id}
                    className="border-l-4 border-l-amber-500 bg-amber-50/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {m.subject || "(Sans objet)"}
                        </p>
                        <p className="text-sm text-slate-500">
                          De{" "}
                          {fullName(m.sender?.first_name, m.sender?.last_name)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="warning">Annonce</Badge>
                        {!m.read_at ? (
                          <Badge tone="info">Nouveau</Badge>
                        ) : (
                          <Badge tone="default">Vu</Badge>
                        )}
                        <span className="text-xs text-slate-400">
                          {format(new Date(m.created_at), "d MMM yyyy", {
                            locale: fr,
                          })}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{m.body}</p>
                    {m.read_at ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Vu le {formatSeenAt(m.read_at)}
                      </p>
                    ) : null}
                    {canReply ? (
                      <div className="mt-3 border-t border-amber-100 pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openChat(m.sender_id)}
                        >
                          Répondre
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-400">
                        Cette annonce n’accepte pas de réponse.
                      </p>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )
      ) : (
        <div className="mx-auto max-w-3xl">
          <Card className="overflow-hidden p-0">
            {selectedOtherId ? (
              <div className="flex h-[75vh] flex-col">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-full p-0"
                    aria-label="Retour aux discussions"
                    onClick={() => setSelectedOtherId(null)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
                    {initials(chatTitle)}
                  </span>
                  <p className="truncate font-semibold text-slate-900">
                    {chatTitle}
                  </p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-100 px-3 py-4 sm:px-4">
                  {(selectedConversation?.messages ?? []).length === 0 ? (
                    <p className="mt-8 text-center text-sm text-slate-400">
                      Aucun message. Écrivez le premier !
                    </p>
                  ) : (
                    (selectedConversation?.messages ?? []).map((m) => {
                      const mine = m.direction === "out";
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex",
                            mine ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "flex max-w-[80%] flex-col",
                              mine ? "items-end" : "items-start",
                            )}
                          >
                            {m.subject ? (
                              <span className="mb-1 max-w-full truncate px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                {m.subject}
                              </span>
                            ) : null}
                            <div
                              className={cn(
                                "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                                mine
                                  ? "bg-brand-600 text-white"
                                  : "bg-slate-200 text-slate-800",
                              )}
                            >
                              <p className="whitespace-pre-wrap break-words">
                                {m.body}
                              </p>
                              <div
                                className={cn(
                                  "mt-1 flex items-center gap-1.5 text-[11px]",
                                  mine
                                    ? "justify-end text-brand-100/80"
                                    : "text-slate-500",
                                )}
                              >
                                {m.is_cc ? (
                                  <span
                                    className={cn(
                                      "rounded px-1 py-0.5 font-medium",
                                      mine
                                        ? "bg-white/15"
                                        : "bg-slate-300/70 text-slate-600",
                                    )}
                                  >
                                    Cc
                                  </span>
                                ) : null}
                                <span>
                                  {format(new Date(m.created_at), "HH:mm")}
                                </span>
                              </div>
                            </div>
                            {m.allow_replies === false ? (
                              <span className="mt-1 max-w-full px-1 text-[10px] italic text-slate-400">
                                Réponses désactivées pour ce message
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={(e) => void handleSendChat(e)}
                  className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
                >
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Écrivez un message…"
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={chatSending || !chatInput.trim()}
                    className="h-11 w-11 shrink-0 rounded-full p-0"
                    aria-label="Envoyer"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            ) : (
              <div>
                <div className="border-b border-slate-100 p-3">
                  <Input
                    value={discussionsSearch}
                    onChange={(e) => setDiscussionsSearch(e.target.value)}
                    placeholder="Rechercher une discussion…"
                  />
                </div>
                {inboxLoading || sentLoading ? (
                  <p className="p-6 text-center text-slate-500">Chargement…</p>
                ) : conversations.length === 0 ? (
                  <div className="p-4">
                    <EmptyState message="Aucune discussion pour le moment. Lancez une conversation depuis « Nouveau message »." />
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-4">
                    <EmptyState message="Aucune discussion ne correspond à la recherche." />
                  </div>
                ) : (
                  <div className="max-h-[70vh] overflow-y-auto">
                    {filteredConversations.map((c) => {
                      const unread = c.unreadCount > 0;
                      return (
                        <button
                          key={c.otherId}
                          type="button"
                          onClick={() => setSelectedOtherId(c.otherId)}
                          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 last:border-b-0"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                            {initials(c.otherName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "truncate text-sm",
                                  unread
                                    ? "font-semibold text-slate-900"
                                    : "font-medium text-slate-800",
                                )}
                              >
                                {c.otherName}
                              </span>
                              <span className="shrink-0 text-xs text-slate-400">
                                {formatConvoTime(c.lastMessage.created_at)}
                              </span>
                            </span>
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "truncate text-xs",
                                  unread
                                    ? "font-medium text-slate-700"
                                    : "text-slate-500",
                                )}
                              >
                                {c.lastMessage.direction === "out"
                                  ? "Vous : "
                                  : ""}
                                {c.lastMessage.body}
                              </span>
                              {unread ? (
                                <Badge tone="success">{c.unreadCount}</Badge>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
