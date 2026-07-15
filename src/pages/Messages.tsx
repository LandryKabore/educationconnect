import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { MessageRow, Profile } from "@/lib/types";
import { fullName } from "@/lib/utils";
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

export default function Messages() {
  const { user, schoolId } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"inbox" | "compose">("inbox");
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data: inbox = [], isLoading } = useQuery({
    queryKey: ["messages-inbox", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, sender:profils!messages_sender_id_fkey(first_name, last_name)")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (MessageRow & {
        sender: { first_name: string; last_name: string };
      })[];
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
        .filter((p) => p.id !== user?.id);
    },
  });

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
    setTab("inbox");
    void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
  };

  return (
    <div>
      <PageHeader
        title="Messages"
        actions={
          <div className="flex gap-2">
            <Button
              variant={tab === "inbox" ? "primary" : "outline"}
              size="sm"
              onClick={() => setTab("inbox")}
            >
              Boîte de réception
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
              <Select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} required>
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
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} required />
            </div>
            <Button type="submit" disabled={sending}>
              {sending ? "Envoi…" : "Envoyer"}
            </Button>
          </form>
        </Card>
      ) : isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : inbox.length === 0 ? (
        <EmptyState message="Aucun message reçu." />
      ) : (
        <div className="space-y-3">
          {inbox.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {m.subject || "(Sans objet)"}
                  </p>
                  <p className="text-sm text-slate-500">
                    De {fullName(m.sender?.first_name, m.sender?.last_name)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!m.read_at ? <Badge tone="info">Nouveau</Badge> : null}
                  <span className="text-xs text-slate-400">
                    {format(new Date(m.created_at), "d MMM yyyy", { locale: fr })}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-700">{m.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
