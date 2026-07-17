import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { MessageRow, Profile } from "@/lib/types";
import { cn, fullName } from "@/lib/utils";
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

type MessageTab = "inbox" | "sent" | "compose";

type InboxMessage = MessageRow & {
  sender: { first_name: string; last_name: string } | null;
};

type SentMessage = MessageRow & {
  recipient: { first_name: string; last_name: string } | null;
};

function formatSeenAt(iso: string) {
  return format(new Date(iso), "d MMM yyyy à HH:mm", { locale: fr });
}

export default function Messages() {
  const { user, schoolId, role } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<MessageTab>("inbox");
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [noReplies, setNoReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const markingRead = useRef(false);

  const canControlReplies =
    role === "school_admin" || role === "teacher" || role === "super_admin";

  const { data: inbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ["messages-inbox", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, sender:profils!messages_sender_id_fkey(first_name, last_name)")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as InboxMessage[];
    },
  });

  const { data: sent = [], isLoading: sentLoading } = useQuery({
    queryKey: ["messages-sent", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "*, recipient:profils!messages_recipient_id_fkey(first_name, last_name)",
        )
        .eq("sender_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SentMessage[];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["message-contacts", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("roles_utilisateurs")
        .select("user_id, profils(*)")
        .eq("school_id", schoolId!)
        .eq("active", true);
      return (roles ?? [])
        .map((r) => (r as unknown as { profils: Profile }).profils)
        .filter((p) => p && p.id !== user?.id);
    },
  });

  const invalidateMessages = () => {
    if (!user) return;
    void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
    void qc.invalidateQueries({ queryKey: ["messages-sent", user.id] });
  };

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
    setSubject("");
    setBody("");
    setNoReplies(false);
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
              onClick={() => setTab("inbox")}
            >
              Boîte de réception
            </Button>
            <Button
              variant={tab === "sent" ? "primary" : "outline"}
              size="sm"
              onClick={() => setTab("sent")}
            >
              Messages envoyés
            </Button>
            <Button
              variant={tab === "compose" ? "primary" : "outline"}
              size="sm"
              onClick={() => setTab("compose")}
            >
              Nouveau message
            </Button>
          </div>
        }
      />

      {tab === "compose" ? (
        <Card className="max-w-lg">
          <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
            <div>
              <Label>Destinataire</Label>
              <Select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                required
              >
                <option value="">Choisir…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(c.first_name, c.last_name)}
                  </option>
                ))}
              </Select>
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
            <Button type="submit" disabled={sending}>
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
            {sent.map((m) => (
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
            ))}
          </div>
        )
      ) : inboxLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : inbox.length === 0 ? (
        <EmptyState message="Aucun message reçu." />
      ) : (
        <div className="space-y-3">
          {inbox.map((m) => {
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
          })}
        </div>
      )}
    </div>
  );
}
