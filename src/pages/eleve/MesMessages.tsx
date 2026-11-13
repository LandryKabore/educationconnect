import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Check, CheckCheck, MessagesSquare, PenSquare, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { MessageRow } from "@/lib/types";
import { cn, fullName, joinOne, matchesSearch } from "@/lib/utils";
import Messages from "@/pages/Messages";

/** /messages: the student gets this page, every other role keeps the shared one. */
export function MessagesRoute() {
  const { role } = useAuth();
  return role === "student" ? <StudentMessages /> : <Messages view="messages" />;
}

type Contact = {
  id: string;
  name: string;
  kind: "teacher" | "admin";
  /** subjects taught in the student's class (teachers only) */
  subjects: string[];
};

type Person = { first_name: string; last_name: string } | null;

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

const COLUMNS =
  "id, school_id, sender_id, recipient_id, subject, body, read_at, created_at, allow_replies, parent_message_id, is_announcement, announcement_id, is_cc, thread_id";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

function listTime(iso: string) {
  const d = parseValidDate(iso);
  if (!d) return "";
  if (isToday(d)) return formatDateSafe(d, "HH:mm");
  if (isYesterday(d)) return "Hier";
  return formatDateSafe(d, "d MMM", { locale: fr });
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Aujourd’hui";
  if (isYesterday(d)) return "Hier";
  const s = format(d, "EEEE d MMMM", { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function contactLine(c: Contact | undefined) {
  if (!c) return "";
  if (c.kind === "admin") return "Administration";
  return c.subjects.length ? `Professeur · ${c.subjects.join(", ")}` : "Professeur";
}

function Avatar({ name, size = "md", tone = "brand" }: { name: string; size?: "sm" | "md"; tone?: "brand" | "slate" }) {
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

function StudentMessages() {
  const { user, schoolId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const markingRead = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  // ?avec=<id>&retour=/path opens a chat directly (links from other screens)
  useEffect(() => {
    const avec = searchParams.get("avec");
    if (!avec) return;
    setSelectedId(avec);
    setPicking(false);
    const retour = searchParams.get("retour");
    setReturnTo(retour && retour.startsWith("/") && !retour.startsWith("//") ? retour : null);
    const next = new URLSearchParams(searchParams);
    next.delete("avec");
    next.delete("retour");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // same query keys as the shared page: realtime and the unread badge keep working
  const { data: inbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ["messages-inbox", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`${COLUMNS}, sender:profils!messages_sender_id_fkey(first_name, last_name)`)
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as (MessageRow & { sender: Person })[];
    },
  });

  const { data: sent = [], isLoading: sentLoading } = useQuery({
    queryKey: ["messages-sent", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`${COLUMNS}, recipient:profils!messages_recipient_id_fkey(first_name, last_name)`)
        .eq("sender_id", user!.id)
        .eq("is_announcement", false)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as (MessageRow & { recipient: Person })[];
    },
  });

  // the student can write to the teachers of their class and to the school administration
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["message-contacts-eleve", schoolId, user?.id],
    enabled: !!schoolId && !!user?.id,
    queryFn: async () => {
      const map = new Map<string, Contact>();
      const { data: enrollment } = await supabase
        .from("inscriptions")
        .select("class_section_id")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      const classId = (enrollment as { class_section_id?: string } | null)?.class_section_id;
      if (classId) {
        const { data: aff } = await supabase
          .from("affectations_enseignement")
          .select(
            "teacher_id, matieres(name), profils:profils!affectations_enseignement_teacher_id_fkey(first_name, last_name)",
          )
          .eq("class_section_id", classId);
        for (const row of aff ?? []) {
          const r = row as { teacher_id: string; matieres: unknown; profils: unknown };
          if (!r.teacher_id || r.teacher_id === user!.id) continue;
          const p = joinOne<{ first_name: string; last_name: string }>(r.profils);
          const subject = joinOne<{ name: string }>(r.matieres)?.name;
          const c = map.get(r.teacher_id) ?? {
            id: r.teacher_id,
            name: fullName(p?.first_name, p?.last_name),
            kind: "teacher" as const,
            subjects: [],
          };
          if (subject && !c.subjects.includes(subject)) c.subjects.push(subject);
          map.set(r.teacher_id, c);
        }
      }
      const { data: admins } = await supabase
        .from("roles_utilisateurs")
        .select("profils(id, first_name, last_name)")
        .eq("school_id", schoolId!)
        .eq("role", "school_admin")
        .eq("active", true);
      for (const row of admins ?? []) {
        const p = joinOne<{ id: string; first_name: string; last_name: string }>(
          (row as { profils: unknown }).profils,
        );
        if (!p?.id || p.id === user!.id || map.has(p.id)) continue;
        map.set(p.id, { id: p.id, name: fullName(p.first_name, p.last_name), kind: "admin", subjects: [] });
      }
      return [...map.values()].sort(
        (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "fr") : a.kind === "teacher" ? -1 : 1),
      );
    },
  });
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const conversations = useMemo((): Conversation[] => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of inbox) {
      if (m.is_announcement) continue;
      const list = map.get(m.sender_id) ?? [];
      list.push({ ...m, direction: "in", otherId: m.sender_id, otherName: fullName(m.sender?.first_name, m.sender?.last_name) });
      map.set(m.sender_id, list);
    }
    for (const m of sent) {
      const list = map.get(m.recipient_id) ?? [];
      list.push({
        ...m,
        direction: "out",
        otherId: m.recipient_id,
        otherName: fullName(m.recipient?.first_name, m.recipient?.last_name),
      });
      map.set(m.recipient_id, list);
    }
    const out: Conversation[] = [];
    for (const [otherId, msgs] of map) {
      msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastMessage = msgs[msgs.length - 1]!;
      out.push({
        otherId,
        otherName: lastMessage.otherName,
        messages: msgs,
        lastMessage,
        unreadCount: msgs.filter((x) => x.direction === "in" && !x.read_at).length,
      });
    }
    return out.sort(
      (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime(),
    );
  }, [inbox, sent]);

  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);
  const shownConversations = conversations.filter((c) =>
    matchesSearch(search, c.otherName, c.lastMessage.body, c.lastMessage.subject, contactLine(contactById.get(c.otherId))),
  );
  const shownContacts = contacts.filter((c) => matchesSearch(search, c.name, ...c.subjects, contactLine(c)));

  const selected = conversations.find((c) => c.otherId === selectedId) ?? null;
  const selectedContact = selectedId ? contactById.get(selectedId) : undefined;
  const chatName = selected?.otherName ?? selectedContact?.name ?? "Conversation";
  const lastIncoming = selected ? [...selected.messages].reverse().find((m) => m.direction === "in") : undefined;
  const repliesClosed = lastIncoming?.allow_replies === false;

  // messages grouped by day for the separators
  const days = useMemo(() => {
    const groups: { key: string; label: string; items: ChatMessage[] }[] = [];
    for (const m of selected?.messages ?? []) {
      const d = parseValidDate(m.created_at);
      const key = d ? format(d, "yyyy-MM-dd") : "?";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(m);
      else groups.push({ key, label: d ? dayLabel(d) : "", items: [m] });
    }
    return groups;
  }, [selected]);

  const invalidate = () => {
    if (!user) return;
    void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
    void qc.invalidateQueries({ queryKey: ["messages-sent", user.id] });
    void qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
  };

  // live: new messages and read receipts
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
      void qc.invalidateQueries({ queryKey: ["messages-sent", user.id] });
      void qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    };
    const channel = supabase
      .channel(`messages-live:${user.id}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  // "en train d'écrire…": ephemeral broadcast, same channel name as the other portals
  useEffect(() => {
    setOtherTyping(false);
    if (typingClearRef.current) clearTimeout(typingClearRef.current);
    if (!user?.id || !selectedId) {
      typingChannelRef.current = null;
      return;
    }
    const pairKey = [user.id, selectedId].sort().join(":");
    const channel = supabase
      .channel(`typing:${pairKey}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { userId?: string })?.userId !== selectedId) return;
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
  }, [user?.id, selectedId]);

  const notifyTyping = () => {
    if (!user?.id || !typingChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    void typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { userId: user.id } });
  };

  // opening a chat marks its incoming messages as read
  useEffect(() => {
    if (!selectedId || !user || inboxLoading || markingRead.current) return;
    const unreadIds = (selected?.messages ?? []).filter((m) => m.direction === "in" && !m.read_at).map((m) => m.id);
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
      qc.setQueryData(["messages-inbox", user.id], (prev: MessageRow[] | undefined) =>
        (prev ?? []).map((m) => (unreadIds.includes(m.id) ? { ...m, read_at: readAt } : m)),
      );
      void qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    })();
  }, [selectedId, user, selected, inboxLoading, qc]);

  useEffect(() => {
    if (!selectedId) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [selectedId, selected?.messages.length, otherTyping]);

  useEffect(() => {
    if (selectedId) inputRef.current?.focus();
  }, [selectedId]);

  const open = (id: string) => {
    setSelectedId(id);
    setPicking(false);
    setSearch("");
    setDraft("");
  };

  const leave = () => {
    if (returnTo) {
      const to = returnTo;
      setReturnTo(null);
      setSelectedId(null);
      navigate(to);
      return;
    }
    setSelectedId(null);
  };

  const send = async () => {
    if (!user || !schoolId || !selectedId) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      school_id: schoolId,
      sender_id: user.id,
      recipient_id: selectedId,
      subject: null,
      body: text,
      allow_replies: true,
      is_announcement: false,
      is_cc: false,
    });
    setSending(false);
    if (error) {
      toast.error("Envoi impossible");
      return;
    }
    setDraft("");
    invalidate();
  };

  const loading = inboxLoading || sentLoading;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]">
      {/* ── Left: discussions, or the people the student can write to ── */}
      <aside
        className={cn(
          "w-full flex-col border-r border-slate-200 lg:flex lg:w-[340px] lg:shrink-0 dark:border-[var(--border)]",
          selectedId ? "hidden" : "flex",
        )}
      >
        <div className="border-b border-slate-200 px-4 pb-3 pt-4 dark:border-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {picking ? "Nouveau message" : "Messages"}
              </h1>
              <p className="text-xs text-slate-500">
                {picking
                  ? "À qui veux-tu écrire ?"
                  : totalUnread > 0
                    ? `${totalUnread} message${totalUnread > 1 ? "s" : ""} non lu${totalUnread > 1 ? "s" : ""}`
                    : "Tout est lu"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPicking((v) => !v);
                setSearch("");
              }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition",
                picking
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[var(--surface-2)] dark:text-slate-200"
                  : "bg-brand-700 text-white hover:bg-brand-800",
              )}
            >
              {picking ? <X className="h-4 w-4" /> : <PenSquare className="h-4 w-4" />}
              {picking ? "Annuler" : "Écrire"}
            </button>
          </div>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={picking ? "Nom ou matière…" : "Rechercher…"}
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {picking ? (
            contactsLoading ? (
              <p className="p-6 text-center text-sm text-slate-500">Chargement…</p>
            ) : shownContacts.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Aucun contact trouvé.</p>
            ) : (
              (["teacher", "admin"] as const).map((kind) => {
                const group = shownContacts.filter((c) => c.kind === kind);
                if (group.length === 0) return null;
                return (
                  <div key={kind}>
                    <p className="sticky top-0 z-10 bg-white/95 px-4 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur dark:bg-[var(--surface)]/95">
                      {kind === "teacher" ? "Mes professeurs" : "Administration"}
                    </p>
                    {group.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => open(c.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]"
                      >
                        <Avatar name={c.name} size="sm" tone={kind === "teacher" ? "brand" : "slate"} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {c.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {kind === "teacher" ? c.subjects.join(", ") || "Professeur" : "Administration"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )
          ) : loading ? (
            <p className="p-6 text-center text-sm text-slate-500">Chargement…</p>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aucune discussion</p>
              <p className="mt-1 text-xs text-slate-500">Appuie sur « Écrire » pour contacter un professeur.</p>
            </div>
          ) : shownConversations.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Aucun résultat.</p>
          ) : (
            shownConversations.map((c) => {
              const active = c.otherId === selectedId;
              const unread = c.unreadCount > 0;
              const contact = contactById.get(c.otherId);
              return (
                <button
                  key={c.otherId}
                  type="button"
                  onClick={() => open(c.otherId)}
                  className={cn(
                    "flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition",
                    active
                      ? "border-brand-700 bg-brand-50 dark:bg-brand-900/30"
                      : "border-transparent hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                  )}
                >
                  <Avatar name={c.otherName} tone={contact?.kind === "admin" ? "slate" : "brand"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm text-slate-900 dark:text-slate-100",
                          unread ? "font-bold" : "font-semibold",
                        )}
                      >
                        {c.otherName}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px]",
                          unread ? "font-bold text-brand-700 dark:text-brand-300" : "text-slate-400",
                        )}
                      >
                        {listTime(c.lastMessage.created_at)}
                      </span>
                    </span>
                    {contact ? (
                      <span className="block truncate text-[11px] font-medium text-slate-400">{contactLine(contact)}</span>
                    ) : null}
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-xs",
                          unread ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-500",
                        )}
                      >
                        {c.lastMessage.direction === "out" ? "Toi : " : ""}
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

      {/* ── Right: the open chat ── */}
      <section className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden lg:flex")}>
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 p-8 text-center dark:bg-[var(--surface-2)]">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <MessagesSquare className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-50">Tes discussions</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Choisis une discussion à gauche, ou écris directement à l’un de tes professeurs.
            </p>
            {contacts.length > 0 ? (
              <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                {contacts
                  .filter((c) => c.kind === "teacher")
                  .slice(0, 6)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => open(c.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm transition hover:border-brand-400 hover:bg-brand-50 dark:border-[var(--border)] dark:bg-[var(--surface)]"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</span>
                      {c.subjects[0] ? <span className="text-xs text-slate-500">{c.subjects[0]}</span> : null}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-[var(--border)]">
              <button
                type="button"
                onClick={leave}
                aria-label={returnTo ? "Retour" : "Retour aux discussions"}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:hover:bg-[var(--surface-2)]",
                  !returnTo && "lg:hidden",
                )}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar name={chatName} size="sm" tone={selectedContact?.kind === "admin" ? "slate" : "brand"} />
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900 dark:text-slate-50">{chatName}</p>
                <p className={cn("truncate text-xs", otherTyping ? "font-semibold text-brand-700" : "text-slate-500")}>
                  {otherTyping ? "en train d’écrire…" : contactLine(selectedContact) || " "}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-6 dark:bg-[var(--surface-2)]">
              {days.length === 0 ? (
                <div className="mt-16 text-center">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nouvelle discussion</p>
                  <p className="mt-1 text-xs text-slate-500">Écris ton premier message à {chatName}.</p>
                </div>
              ) : (
                days.map((day) => (
                  <div key={day.key} className="space-y-1.5">
                    <div className="sticky top-0 z-10 flex justify-center py-2">
                      <span className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-[var(--surface)] dark:ring-[var(--border)]">
                        {day.label}
                      </span>
                    </div>
                    {day.items.map((m, i) => {
                      const mine = m.direction === "out";
                      const prev = day.items[i - 1];
                      const grouped = prev && prev.direction === m.direction;
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
                              <div
                                className={cn(
                                  "mt-1 flex items-center justify-end gap-1 text-[10px]",
                                  mine ? "text-white/70" : "text-slate-400",
                                )}
                              >
                                {m.is_cc ? <span className="rounded bg-black/10 px-1 font-semibold">Cc</span> : null}
                                <span>{formatDateSafe(m.created_at, "HH:mm")}</span>
                                {mine ? (
                                  m.read_at ? (
                                    <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label="Vu" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" aria-label="Envoyé" />
                                  )
                                ) : null}
                              </div>
                            </div>
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
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-slate-400"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            {repliesClosed ? (
              <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-[var(--border)] dark:bg-amber-950/40 dark:text-amber-100">
                Le dernier message de {chatName} n’attend pas de réponse.
              </p>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-[var(--border)]"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  notifyTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={`Écrire à ${chatName}…`}
                className="max-h-32 min-h-[42px] flex-1 resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition [field-sizing:content] focus:border-brand-500 focus:bg-white dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Envoyer"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md bg-brand-700 text-white transition hover:bg-brand-800 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="hidden px-4 pb-2 text-[10px] text-slate-400 lg:block">
              Entrée pour envoyer · Maj + Entrée pour aller à la ligne
            </p>
          </>
        )}
      </section>
    </div>
  );
}
