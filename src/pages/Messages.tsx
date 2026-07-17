import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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

type MessageTab = "inbox" | "sent" | "compose" | "announce";

type ContactRole = "student" | "parent" | "teacher" | "school_admin";

type MessageContact = {
  id: string;
  first_name: string;
  last_name: string;
  role: ContactRole;
};

type InboxMessage = MessageRow & {
  sender: { first_name: string; last_name: string } | null;
};

type SentMessage = MessageRow & {
  recipient: { first_name: string; last_name: string } | null;
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

function asProfile(raw: unknown): Profile | null {
  return (raw as Profile | null) ?? null;
}

function pushContact(
  map: Map<string, MessageContact>,
  profile: Profile | null | undefined,
  role: ContactRole,
  selfId?: string,
) {
  if (!profile?.id || profile.id === selfId) return;
  if (map.has(profile.id)) return;
  map.set(profile.id, {
    id: profile.id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    role,
  });
}

export default function Messages() {
  const { user, schoolId, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<MessageTab>("inbox");
  const [recipientRole, setRecipientRole] = useState<ContactRole | "">("");
  const [recipientId, setRecipientId] = useState("");
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
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const markingRead = useRef(false);

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
          "id, school_id, sender_id, recipient_id, subject, body, read_at, created_at, allow_replies, parent_message_id, sender:profils!messages_sender_id_fkey(first_name, last_name)",
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
          "id, school_id, sender_id, recipient_id, subject, body, read_at, created_at, allow_replies, parent_message_id, recipient:profils!messages_recipient_id_fkey(first_name, last_name)",
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

      return [...map.values()].sort((a, b) =>
        fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
        ),
      );
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

  const searchedContacts = useMemo(() => {
    return filteredContacts.filter((c) =>
      matchesSearch(
        contactSearch,
        c.first_name,
        c.last_name,
        ROLE_LABELS[c.role as AppRole],
      ),
    );
  }, [filteredContacts, contactSearch]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === recipientId) ?? null,
    [contacts, recipientId],
  );

  const filteredInbox = useMemo(() => {
    return inbox.filter((m) =>
      matchesSearch(
        listSearch,
        m.subject,
        m.body,
        m.sender?.first_name,
        m.sender?.last_name,
      ),
    );
  }, [inbox, listSearch]);

  const filteredSent = useMemo(() => {
    return sent.filter((m) =>
      matchesSearch(
        listSearch,
        m.subject,
        m.body,
        m.recipient?.first_name,
        m.recipient?.last_name,
      ),
    );
  }, [sent, listSearch]);

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
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  useEffect(() => {
    if (tab !== "inbox" || !user || inboxLoading || markingRead.current) return;
    const unreadIds = inbox.filter((m) => !m.read_at).map((m) => m.id);
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
    })();
  }, [tab, user, inbox, inboxLoading, qc]);

  useEffect(() => {
    if (
      recipientId &&
      !filteredContacts.some((c) => c.id === recipientId)
    ) {
      setRecipientId("");
    }
  }, [filteredContacts, recipientId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !schoolId || !recipientId) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      school_id: schoolId,
      sender_id: user.id,
      recipient_id: recipientId,
      subject: subject.trim() || null,
      body: body.trim(),
      allow_replies: canControlReplies ? !noReplies : true,
    });
    setSending(false);
    if (error) {
      toast.error("Envoi impossible");
      return;
    }
    toast.success("Message envoyé");
    setRecipientId("");
    setRecipientRole("");
    setContactSearch("");
    setSubject("");
    setBody("");
    setNoReplies(false);
    setTab("sent");
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
    const payload = announceRecipients.map((c) => ({
      school_id: schoolId,
      sender_id: user.id,
      recipient_id: c.id,
      subject: subjectText,
      body: text,
      allow_replies: !announceNoReplies,
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
    setTab("sent");
    invalidateMessages();
  };

  const handleReply = async (message: InboxMessage) => {
    if (!user || !schoolId || !replyBody.trim()) return;
    if (!message.allow_replies) {
      toast.error("Ce message n’accepte pas de réponse");
      return;
    }
    setReplySending(true);
    const reSubject = message.subject?.startsWith("Re: ")
      ? message.subject
      : `Re: ${message.subject || "Message"}`;
    const { error } = await supabase.from("messages").insert({
      school_id: schoolId,
      sender_id: user.id,
      recipient_id: message.sender_id,
      subject: reSubject,
      body: replyBody.trim(),
      allow_replies: true,
      parent_message_id: message.id,
    });
    setReplySending(false);
    if (error) {
      toast.error("Réponse impossible");
      return;
    }
    toast.success("Réponse envoyée");
    setReplyingTo(null);
    setReplyBody("");
    setTab("sent");
    invalidateMessages();
  };

  return (
    <div>
      <PageHeader
        title="Messages"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "inbox" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setTab("inbox");
                setListSearch("");
              }}
            >
              Boîte de réception
            </Button>
            <Button
              variant={tab === "sent" ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setTab("sent");
                setListSearch("");
              }}
            >
              Messages envoyés
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
                Annonce
              </Button>
            ) : null}
          </div>
        }
      />

      {tab === "announce" && canAnnounce ? (
        <Card className="max-w-lg">
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
        <Card className="max-w-lg">
          <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
            <div>
              <Label>Type de destinataire</Label>
              <Select
                value={recipientRole}
                onChange={(e) => {
                  setRecipientRole(e.target.value as ContactRole | "");
                  setRecipientId("");
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
              <Label>Destinataire</Label>
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Rechercher un nom…"
                className="mb-2"
                disabled={contactsLoading || filteredContacts.length === 0}
              />
              {selectedContact ? (
                <p className="mb-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-950">
                  Sélectionné :{" "}
                  <strong>
                    {fullName(
                      selectedContact.first_name,
                      selectedContact.last_name,
                    )}
                  </strong>{" "}
                  · {ROLE_LABELS[selectedContact.role as AppRole]}
                  <button
                    type="button"
                    className="ml-2 text-xs font-medium text-brand-700 underline"
                    onClick={() => setRecipientId("")}
                  >
                    Changer
                  </button>
                </p>
              ) : null}
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
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
                    const selected = c.id === recipientId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setRecipientId(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0",
                          selected
                            ? "bg-brand-50 font-medium text-brand-950"
                            : "hover:bg-slate-50",
                        )}
                      >
                        <span>{fullName(c.first_name, c.last_name)}</span>
                        <span className="shrink-0 text-xs text-slate-500">
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
              disabled={sending || !recipientId || filteredContacts.length === 0}
            >
              {sending ? "Envoi…" : "Envoyer"}
            </Button>
          </form>
        </Card>
      ) : tab === "sent" ? (
        sentLoading ? (
          <p className="text-slate-500">Chargement…</p>
        ) : sent.length === 0 ? (
          <EmptyState message="Aucun message envoyé." />
        ) : (
          <div className="space-y-3">
            <div className="max-w-md">
              <Label htmlFor="search-sent">Rechercher</Label>
              <Input
                id="search-sent"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Destinataire, objet, contenu…"
              />
            </div>
            {filteredSent.length === 0 ? (
              <EmptyState message="Aucun message ne correspond à la recherche." />
            ) : (
              filteredSent.map((m) => (
              <Card
                key={m.id}
                className={cn(
                  m.allow_replies
                    ? "border-l-4 border-l-teal-500"
                    : "border-l-4 border-l-slate-300 bg-slate-50",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{m.subject || "(Sans objet)"}</p>
                    <p className="text-sm text-slate-500">
                      À{" "}
                      {fullName(
                        m.recipient?.first_name,
                        m.recipient?.last_name,
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.read_at ? (
                      <Badge tone="success">Vu</Badge>
                    ) : (
                      <Badge tone="warning">Non lu</Badge>
                    )}
                    {m.allow_replies ? (
                      <Badge tone="success">Réponses autorisées</Badge>
                    ) : (
                      <Badge tone="default">Sans réponse</Badge>
                    )}
                    <span className="text-xs text-slate-400">
                      {format(new Date(m.created_at), "d MMM yyyy", {
                        locale: fr,
                      })}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700">{m.body}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {m.read_at
                    ? `Vu le ${formatSeenAt(m.read_at)}`
                    : "Pas encore vu par le destinataire"}
                </p>
              </Card>
              ))
            )}
          </div>
        )
      ) : inboxLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : inbox.length === 0 ? (
        <EmptyState message="Aucun message reçu." />
      ) : (
        <div className="space-y-3">
          <div className="max-w-md">
            <Label htmlFor="search-inbox">Rechercher</Label>
            <Input
              id="search-inbox"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Expéditeur, objet, contenu…"
            />
          </div>
          {filteredInbox.length === 0 ? (
            <EmptyState message="Aucun message ne correspond à la recherche." />
          ) : (
          filteredInbox.map((m) => {
            const canReply = m.allow_replies !== false;
            const isReplying = replyingTo === m.id;
            return (
              <Card
                key={m.id}
                className={cn(
                  canReply
                    ? "border-l-4 border-l-teal-500"
                    : "border-l-4 border-l-slate-300 bg-slate-50",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{m.subject || "(Sans objet)"}</p>
                    <p className="text-sm text-slate-500">
                      De {fullName(m.sender?.first_name, m.sender?.last_name)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!m.read_at ? (
                      <Badge tone="info">Nouveau</Badge>
                    ) : (
                      <Badge tone="default">Vu</Badge>
                    )}
                    {canReply ? (
                      <Badge tone="success">Réponse possible</Badge>
                    ) : (
                      <Badge tone="default">Sans réponse</Badge>
                    )}
                    <span className="text-xs text-slate-400">
                      {format(new Date(m.created_at), "d MMM yyyy", {
                        locale: fr,
                      })}
                    </span>
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-2 text-sm",
                    canReply ? "text-slate-700" : "text-slate-600",
                  )}
                >
                  {m.body}
                </p>
                {m.read_at ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Vu le {formatSeenAt(m.read_at)}
                  </p>
                ) : null}
                {canReply ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {isReplying ? (
                      <div className="space-y-2">
                        <Textarea
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          placeholder="Votre réponse…"
                          required
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={replySending || !replyBody.trim()}
                            onClick={() => void handleReply(m)}
                          >
                            {replySending ? "Envoi…" : "Envoyer la réponse"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyBody("");
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReplyingTo(m.id);
                          setReplyBody("");
                        }}
                      >
                        Répondre
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">
                    L’expéditeur n’autorise pas de réponse à ce message.
                  </p>
                )}
              </Card>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}
