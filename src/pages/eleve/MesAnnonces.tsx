import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, Megaphone, MessageSquare, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateSafe, parseValidDate } from "@/lib/dateFr";
import { supabase } from "@/lib/supabase";
import type { MessageRow } from "@/lib/types";
import { cn, fullName, matchesSearch } from "@/lib/utils";
import Messages from "@/pages/Messages";

/** /annonces: the student gets this reader, every other role keeps the shared page. */
export function AnnoncesRoute() {
  const { role } = useAuth();
  return role === "student" ? <StudentAnnonces /> : <Messages view="annonces" />;
}

type Announcement = MessageRow & { sender: { first_name: string; last_name: string } | null };

type Filter = "all" | "unread";

function listDate(iso: string) {
  const d = parseValidDate(iso);
  if (!d) return "";
  if (isToday(d)) return formatDateSafe(d, "HH:mm");
  if (isYesterday(d)) return "Hier";
  return formatDateSafe(d, "d MMM", { locale: fr });
}

function longDate(iso: string) {
  const s = formatDateSafe(iso, "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StudentAnnonces() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const marking = useRef(new Set<string>());

  // same key as the shared page (realtime + the menu badge keep working)
  const { data: inbox = [], isLoading } = useQuery({
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
      return data as unknown as Announcement[];
    },
  });

  const announcements = useMemo(() => inbox.filter((m) => m.is_announcement), [inbox]);
  const unreadCount = announcements.filter((a) => !a.read_at).length;
  const shown = announcements.filter(
    (a) =>
      (filter === "all" || !a.read_at) &&
      matchesSearch(search, a.subject, a.body, a.sender?.first_name, a.sender?.last_name),
  );
  const selected = announcements.find((a) => a.id === selectedId) ?? null;

  // on a laptop, open the newest announcement straight away
  useEffect(() => {
    if (selectedId || announcements.length === 0) return;
    if (window.matchMedia("(min-width: 1024px)").matches) setSelectedId(announcements[0]!.id);
  }, [announcements, selectedId]);

  // live: a new announcement shows up without reloading
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`annonces-live:${user.id}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["messages-inbox", user.id] });
          void qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  // an announcement is read once it is opened
  useEffect(() => {
    if (!user || !selected || selected.read_at || marking.current.has(selected.id)) return;
    const id = selected.id;
    marking.current.add(id);
    const readAt = new Date().toISOString();
    void (async () => {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: readAt })
        .eq("id", id)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      marking.current.delete(id);
      if (error) return;
      qc.setQueryData(["messages-inbox", user.id], (prev: Announcement[] | undefined) =>
        (prev ?? []).map((m) => (m.id === id ? { ...m, read_at: readAt } : m)),
      );
      void qc.invalidateQueries({ queryKey: ["messages-unread-count", user.id] });
    })();
  }, [selected, user, qc]);

  const senderName = (a: Announcement) => fullName(a.sender?.first_name, a.sender?.last_name) || "L’établissement";

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--surface)]">
      {/* ── Left: the list ── */}
      <aside
        className={cn(
          "w-full flex-col border-r border-slate-200 lg:flex lg:w-[360px] lg:shrink-0 dark:border-[var(--border)]",
          selectedId ? "hidden" : "flex",
        )}
      >
        <div className="border-b border-slate-200 px-4 pb-3 pt-4 dark:border-[var(--border)]">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Annonces</h1>
          <p className="text-xs text-slate-500">
            {unreadCount > 0
              ? `${unreadCount} nouvelle${unreadCount > 1 ? "s" : ""} annonce${unreadCount > 1 ? "s" : ""}`
              : "Informations officielles de l’établissement"}
          </p>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
            />
          </label>
          <div className="mt-2 grid grid-cols-2 rounded-md bg-slate-100 p-0.5 dark:bg-[var(--surface-2)]">
            {(
              [
                ["all", `Toutes (${announcements.length})`],
                ["unread", `Non lues (${unreadCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded px-2 py-1.5 text-xs font-semibold transition",
                  filter === key
                    ? "bg-white text-brand-800 shadow-sm dark:bg-[var(--surface)] dark:text-brand-200"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-6 text-center text-sm text-slate-500">Chargement…</p>
          ) : announcements.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Aucune annonce pour le moment.</p>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              {filter === "unread" && !search ? "Tout est lu." : "Aucun résultat."}
            </p>
          ) : (
            shown.map((a) => {
              const active = a.id === selectedId;
              const unread = !a.read_at;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    "flex w-full gap-3 border-b border-l-[3px] border-b-slate-100 px-4 py-3 text-left transition dark:border-b-[var(--border)]",
                    active
                      ? "border-l-brand-700 bg-brand-50 dark:bg-brand-900/30"
                      : "border-l-transparent hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span className="mt-1.5 flex w-2 shrink-0 justify-center">
                    {unread ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-500">{senderName(a)}</span>
                      <span className={cn("shrink-0 text-[11px]", unread ? "font-bold text-brand-700" : "text-slate-400")}>
                        {listDate(a.created_at)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-sm text-slate-900 dark:text-slate-100",
                        unread ? "font-bold" : "font-semibold",
                      )}
                    >
                      {a.subject || "(Sans objet)"}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.body}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Right: the announcement being read ── */}
      <section className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden lg:flex")}>
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 p-8 text-center dark:bg-[var(--surface-2)]">
            <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Megaphone className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-50">
              {announcements.length ? "Choisis une annonce" : "Aucune annonce"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Les informations de l’établissement et de tes professeurs arrivent ici.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 lg:hidden dark:border-[var(--border)]">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
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
                Annonce officielle
              </span>
              <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-slate-900 lg:text-[1.75rem] dark:text-slate-50">
                {selected.subject || "(Sans objet)"}
              </h2>
              <div className="mt-4 flex items-center gap-3 border-b border-slate-200 pb-5 dark:border-[var(--border)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-200 text-xs font-bold text-slate-700">
                  {senderName(selected)
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{senderName(selected)}</p>
                  <p className="text-xs text-slate-500">{longDate(selected.created_at)}</p>
                </div>
              </div>
              <p className="mt-6 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                {selected.body}
              </p>
              <div className="mt-8 border-t border-slate-200 pt-5 dark:border-[var(--border)]">
                {selected.allow_replies !== false ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/messages?avec=${encodeURIComponent(selected.sender_id)}&retour=/annonces`)
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Répondre à {senderName(selected).split(" ")[0]}
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">Cette annonce n’accepte pas de réponse.</p>
                )}
              </div>
            </article>
          </div>
        )}
      </section>
    </div>
  );
}
