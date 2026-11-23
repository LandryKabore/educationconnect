import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleHelp,
  EyeOff,
  Flag,
  Hand,
  Heart,
  ListChecks,
  Loader2,
  Lock,
  Search,
  UserPlus,
  MessagesSquare,
  NotebookPen,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { relativeFr } from "@/lib/portalHomeFormat";
import { timeFr } from "@/lib/timetableLayout";
import {
  KIND_LABEL,
  REPORT_REASONS,
  addTask,
  answerInvite,
  archiveGroup,
  fetchClassmates,
  inviteToGroup,
  createGroup,
  createPost,
  createReply,
  deletePost,
  deleteReply,
  deleteTask,
  fetchSpaceFeed,
  fetchSpaceGroup,
  fetchSpaceGroups,
  fetchSpacePost,
  joinGroup,
  leaveGroup,
  moderate,
  reportContent,
  sendGroupMessage,
  signSpacePhotos,
  toggleReaction,
  updatePost,
  updateTask,
  uploadSpacePhoto,
  type PostKind,
  type SpaceComposition,
  type SpaceMember,
  type SpacePostSummary,
  type SpaceSubject,
} from "@/lib/espaceClasse";

/*
 * The class space of one class. The student page and the administration's view share it:
 * `moderator` swaps writing (posting, replying, reacting) for hiding / restoring.
 */

type Tab = "discussions" | "fiches" | "groupes" | "revisions";

const square = "rounded-md border border-slate-200 bg-white dark:border-[var(--border)] dark:bg-[var(--surface)]";
const chip = (on: boolean) =>
  cn(
    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-semibold transition",
    on
      ? "border-brand-700 bg-brand-700 text-white"
      : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-slate-200",
  );

function errText(e: unknown) {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

// ---------------------------------------------------------------- photos

function usePhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: ["espace-classe", "photos", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: () => signSpacePhotos(paths),
  });
}

function Photos({ paths, small = false }: { paths: string[]; small?: boolean }) {
  const { data: urls = {} } = usePhotoUrls(paths);
  const [open, setOpen] = useState<string | null>(null);
  if (paths.length === 0) return null;
  return (
    <>
      <div className={cn("mt-3 grid gap-2", paths.length === 1 ? "grid-cols-1" : "grid-cols-2", small && "max-w-xs")}>
        {paths.map((p) => (
          <button key={p} type="button" onClick={() => setOpen(urls[p] ?? null)} className="block overflow-hidden rounded-md bg-slate-100 dark:bg-white/5">
            {urls[p] ? (
              <img src={urls[p]} alt="Photo jointe" className={cn("w-full object-cover", small ? "h-28" : "max-h-72")} loading="lazy" />
            ) : (
              <span className={cn("flex items-center justify-center text-slate-400", small ? "h-28" : "h-48")}>
                <Loader2 className="h-5 w-5 animate-spin" />
              </span>
            )}
          </button>
        ))}
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Photo">
          <img src={open} alt="Photo jointe" className="max-h-full max-w-full rounded-md" />
          <button type="button" className="absolute right-4 top-4 rounded-md bg-white/10 p-2 text-white" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function PhotoPicker({
  classId,
  userId,
  value,
  onChange,
  max,
}: {
  classId: string;
  userId: string;
  value: string[];
  onChange: (paths: string[]) => void;
  max: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: urls = {} } = usePhotoUrls(value);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const room = max - value.length;
      const paths: string[] = [];
      for (const f of Array.from(files).slice(0, room)) paths.push(await uploadSpacePhoto(classId, userId, f));
      onChange([...value, ...paths]);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((p) => (
        <span key={p} className="relative h-16 w-16 overflow-hidden rounded-md bg-slate-100 dark:bg-white/5">
          {urls[p] ? <img src={urls[p]} alt="" className="h-full w-full object-cover" /> : null}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== p))}
            className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white"
            aria-label="Retirer la photo"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {value.length < max ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex h-16 items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-600 dark:text-slate-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Photo
        </button>
      ) : null}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void pick(e.target.files)} />
    </div>
  );
}

// ---------------------------------------------------------------- report / moderate

function ReportButton({
  classId,
  userId,
  targetType,
  targetId,
}: {
  classId: string;
  userId: string;
  targetType: "post" | "reply" | "group_message";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await reportContent(classId, targetType, targetId, userId, detail.trim() ? `${reason} : ${detail.trim()}` : reason);
      toast.success("Merci, l’administration de l’école va regarder.");
      setOpen(false);
    } catch (e) {
      const msg = errText(e);
      toast.error(/duplicate|unique/i.test(msg) ? "Tu as déjà signalé ce message." : msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-600" title="Signaler">
        <Flag className="h-3.5 w-3.5" /> Signaler
      </button>
      <Modal open={open} title="Signaler ce message" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">L’administration de l’école recevra ton signalement. La personne ne saura pas que c’est toi.</p>
          <div className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-brand-700" />
                {r}
              </label>
            ))}
          </div>
          <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Précision (facultatif)" rows={2} maxLength={200} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-md" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="danger" className="rounded-md" onClick={() => void send()} disabled={busy}>Signaler</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ModerateButton({
  targetType,
  targetId,
  hidden,
  onDone,
}: {
  targetType: "post" | "reply" | "group_message";
  targetId: string;
  hidden: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await moderate(targetType, targetId, !hidden);
      toast.success(hidden ? "Message rétabli" : "Message masqué");
      onDone();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      className={cn("inline-flex items-center gap-1 text-xs font-semibold", hidden ? "text-brand-700 hover:text-brand-800" : "text-red-600 hover:text-red-700")}
    >
      {hidden ? <ShieldCheck className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {hidden ? "Rétablir" : "Masquer"}
    </button>
  );
}

function HiddenNote({ reason, moderator }: { reason: string | null; moderator: boolean }) {
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <EyeOff className="h-3.5 w-3.5" />
      {moderator ? `Masqué · ${reason ?? "par l’administration"}` : `Masqué par l’administration${reason ? ` · ${reason}` : ""} — visible par toi seul(e)`}
    </p>
  );
}

// ---------------------------------------------------------------- composer

function Composer({
  open,
  onClose,
  classId,
  userId,
  subjects,
  initialKind,
  initialSubject,
  evaluation,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  userId: string;
  subjects: SpaceSubject[];
  initialKind: PostKind;
  initialSubject?: string | null;
  evaluation?: { id: string; title: string } | null;
  onCreated: (id: string) => void;
}) {
  const [kind, setKind] = useState<PostKind>(initialKind);
  const [subjectId, setSubjectId] = useState(initialSubject ?? "");
  const [title, setTitle] = useState(evaluation ? `${evaluation.title} : ` : "");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setSubjectId(initialSubject ?? "");
      setTitle(evaluation ? `${evaluation.title} : ` : "");
      setBody("");
      setPhotos([]);
    }
  }, [open, initialKind, initialSubject, evaluation]);
  const submit = async () => {
    if (!title.trim()) return toast.error(kind === "question" ? "Écris ta question." : "Donne un titre.");
    if (kind === "fiche" && !subjectId) return toast.error("Choisis la matière de la fiche.");
    setBusy(true);
    try {
      const id = await createPost({
        classId,
        authorId: userId,
        kind,
        subjectId: subjectId || null,
        evaluationId: evaluation?.id ?? null,
        title,
        body,
        photos,
      });
      toast.success(kind === "fiche" ? "Fiche partagée" : "Publié");
      onCreated(id);
      onClose();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const isFiche = kind === "fiche";
  return (
    <Modal open={open} title={isFiche ? "Partager une fiche de révision" : "Nouveau message à la classe"} onClose={onClose} size="lg">
      <div className="space-y-4">
        {!isFiche ? (
          <div className="flex gap-2">
            <button type="button" className={chip(kind === "question")} onClick={() => setKind("question")}>
              <CircleHelp className="h-4 w-4" /> Question
            </button>
            <button type="button" className={chip(kind === "discussion")} onClick={() => setKind("discussion")}>
              <MessagesSquare className="h-4 w-4" /> Discussion
            </button>
          </div>
        ) : null}
        {evaluation ? (
          <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">À propos de l’exercice « {evaluation.title} »</p>
        ) : null}
        <div>
          <Label htmlFor="space-subject">Matière{isFiche ? <span className="text-red-600"> *</span> : null}</Label>
          <Select id="space-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">{isFiche ? "Choisir…" : "Toutes matières"}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="space-title">{kind === "question" ? "Ta question" : "Titre"}</Label>
          <Input
            id="space-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder={kind === "question" ? "Ex. : Comment on factorise x² − 9 ?" : isFiche ? "Ex. : Les fractions en 5 points" : "Ex. : Qui révise samedi ?"}
          />
        </div>
        <div>
          <Label htmlFor="space-body">{isFiche ? "Contenu de la fiche" : "Détails (facultatif)"}</Label>
          <Textarea id="space-body" value={body} onChange={(e) => setBody(e.target.value)} rows={isFiche ? 8 : 4} maxLength={4000} />
        </div>
        <PhotoPicker classId={classId} userId={userId} value={photos} onChange={setPhotos} max={4} />
        <p className="text-xs text-slate-500">Visible par ta classe et l’administration de l’école. Reste respectueux et ne publie pas de réponses à copier.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-md" onClick={onClose}>Annuler</Button>
          <Button className="rounded-md" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publier
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- feed

function PostCard({ p, onOpen, userId, moderator, refresh }: { p: SpacePostSummary; onOpen: () => void; userId: string; moderator: boolean; refresh: () => void }) {
  const isQ = p.kind === "question";
  const reacted = p.myReactions.includes(isQ ? "moi_aussi" : "utile");
  const react = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleReaction("post", p.id, userId, isQ ? "moi_aussi" : "utile", !reacted);
      refresh();
    } catch (err) {
      toast.error(errText(err));
    }
  };
  return (
    <article
      onClick={onOpen}
      className={cn(square, "cursor-pointer p-4 transition hover:border-brand-300", p.hidden && "opacity-75")}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" ? onOpen() : undefined)}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 uppercase tracking-wide",
            p.kind === "question" ? "bg-sky-100 text-sky-800" : p.kind === "fiche" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700",
          )}
        >
          {KIND_LABEL[p.kind]}
        </span>
        {p.subjectName ? <span className="text-brand-700 dark:text-brand-300">{p.subjectName}</span> : null}
        {isQ && p.answered ? (
          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Résolue</span>
        ) : null}
        {moderator && p.reports ? <span className="inline-flex items-center gap-1 text-red-600"><Flag className="h-3.5 w-3.5" /> {p.reports}</span> : null}
        <span className="ml-auto font-normal text-slate-400">{relativeFr(p.lastActivityAt)}</span>
      </div>
      <h3 className="mt-2 font-bold text-slate-900 dark:text-slate-50">{p.title}</h3>
      {p.body ? <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{p.body}</p> : null}
      {p.evaluationTitle ? <p className="mt-1 text-xs text-slate-500">Exercice : {p.evaluationTitle}</p> : null}
      <Photos paths={p.photos.slice(0, 2)} small />
      {p.hidden ? <HiddenNote reason={p.hiddenReason} moderator={moderator} /> : null}
      <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
        <span className="font-medium text-slate-700 dark:text-slate-200">{p.mine ? "Toi" : p.authorName}</span>
        <span className="inline-flex items-center gap-1"><MessagesSquare className="h-4 w-4" /> {p.replies}</span>
        {moderator ? (
          <span className="inline-flex items-center gap-1">
            {isQ ? <Hand className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />} {isQ ? p.moiAussi : p.utile}
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => void react(e)}
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold transition", reacted ? "bg-brand-50 text-brand-700" : "hover:bg-slate-100 dark:hover:bg-white/5")}
            title={isQ ? "J’ai la même question" : "Cette fiche m’aide"}
          >
            {isQ ? <Hand className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />}
            {isQ ? "Moi aussi" : "Utile"} · {isQ ? p.moiAussi : p.utile}
          </button>
        )}
      </div>
    </article>
  );
}

function Feed({
  classId,
  userId,
  subjects,
  moderator,
  kind,
  onOpen,
  onCompose,
}: {
  classId: string;
  userId: string;
  subjects: SpaceSubject[];
  moderator: boolean;
  kind: "discussions" | "fiche";
  onOpen: (id: string) => void;
  onCompose: (kind: PostKind, subjectId?: string | null) => void;
}) {
  const [subject, setSubject] = useState<string | null>(null);
  const [filter, setFilter] = useState<"tout" | "question" | "discussion" | "sans">("tout");
  const qc = useQueryClient();
  const queryKind = kind === "fiche" ? "fiche" : filter === "question" || filter === "sans" ? "question" : filter === "discussion" ? "discussion" : "discussions";
  const { data = [], isLoading } = useQuery({
    queryKey: ["espace-classe", "feed", classId, queryKind, subject],
    queryFn: () => fetchSpaceFeed(classId, queryKind, subject),
    refetchInterval: 60_000,
  });
  const shown = filter === "sans" ? data.filter((p) => !p.answered) : data;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["espace-classe", "feed", classId] });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {kind === "discussions" ? (
          <>
            {(
              [
                ["tout", "Tout"],
                ["question", "Questions"],
                ["sans", "Sans réponse"],
                ["discussion", "Discussions"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className={chip(filter === k)} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </>
        ) : null}
        <Select value={subject ?? ""} onChange={(e) => setSubject(e.target.value || null)} aria-label="Matière" className="!h-9 w-auto">
          <option value="">Toutes les matières</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        {!moderator ? (
          <Button className="ml-auto rounded-md" onClick={() => onCompose(kind === "fiche" ? "fiche" : "question", subject)}>
            <Plus className="h-4 w-4" /> {kind === "fiche" ? "Partager une fiche" : "Poser une question"}
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : shown.length === 0 ? (
        <div className={cn(square, "p-8 text-center")}>
          {kind === "fiche" ? <NotebookPen className="mx-auto h-8 w-8 text-brand-600" /> : <CircleHelp className="mx-auto h-8 w-8 text-brand-600" />}
          <p className="mt-3 font-semibold text-slate-900 dark:text-slate-50">
            {kind === "fiche" ? "Aucune fiche pour le moment" : filter === "sans" ? "Toutes les questions ont une réponse" : "Rien pour le moment"}
          </p>
          {!moderator ? (
            <p className="mt-1 text-sm text-slate-500">
              {kind === "fiche" ? "Partage tes notes : elles aideront toute la classe avant les compositions." : "Une question sur un exercice ? Pose-la à ta classe."}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={cn("grid gap-3", kind === "fiche" && "sm:grid-cols-2")}>
          {shown.map((p) => (
            <PostCard key={p.id} p={p} onOpen={() => onOpen(p.id)} userId={userId} moderator={moderator} refresh={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one post

function PostView({ postId, classId, userId, moderator, onBack }: { postId: string; classId: string; userId: string; moderator: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: p, isLoading, error } = useQuery({
    queryKey: ["espace-classe", "post", postId],
    queryFn: () => fetchSpacePost(postId),
    refetchInterval: 30_000,
  });
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["espace-classe", "post", postId] });
    void qc.invalidateQueries({ queryKey: ["espace-classe", "feed", classId] });
  };
  if (isLoading) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (error || !p) {
    return (
      <div className="space-y-3">
        <BackButton onClick={onBack} />
        <p className="text-sm text-slate-500">Ce message n’existe plus.</p>
      </div>
    );
  }
  const isQ = p.kind === "question";
  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await createReply(p.id, userId, reply, photos);
      setReply("");
      setPhotos([]);
      refresh();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const react = async (kind: "moi_aussi" | "utile") => {
    try {
      await toggleReaction("post", p.id, userId, kind, !p.myReactions.includes(kind));
      refresh();
    } catch (e) {
      toast.error(errText(e));
    }
  };
  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />
      <article className={cn(square, "p-5")}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 uppercase tracking-wide text-slate-700">{KIND_LABEL[p.kind]}</span>
          {p.subjectName ? <span className="text-brand-700 dark:text-brand-300">{p.subjectName}</span> : null}
          <span className="ml-auto font-normal text-slate-400">
            {p.mine ? "Toi" : p.authorName} · {relativeFr(p.createdAt)}
            {p.editedAt ? " · modifié" : ""}
          </span>
        </div>
        <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50">{p.title}</h2>
        {p.evaluationTitle ? <p className="mt-1 text-sm text-slate-500">Exercice : {p.evaluationTitle}</p> : null}
        {p.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{p.body}</p> : null}
        <Photos paths={p.photos} />
        {p.hidden ? <HiddenNote reason={p.hiddenReason} moderator={moderator} /> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-[var(--border)]">
          {!moderator ? (
            <button
              type="button"
              onClick={() => void react(isQ ? "moi_aussi" : "utile")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold",
                p.myReactions.includes(isQ ? "moi_aussi" : "utile") ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5",
              )}
            >
              {isQ ? <Hand className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />}
              {isQ ? "Moi aussi" : "Utile"} · {isQ ? p.moiAussi : p.utile}
            </button>
          ) : (
            <span className="text-sm text-slate-500">{isQ ? `${p.moiAussi} « Moi aussi »` : `${p.utile} « Utile »`}</span>
          )}
          <span className="ml-auto flex items-center gap-3">
            {moderator ? (
              <ModerateButton targetType="post" targetId={p.id} hidden={p.hidden} onDone={refresh} />
            ) : p.mine ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Supprimer ce message et ses réponses ?")) return;
                  try {
                    await deletePost(p.id);
                    toast.success("Supprimé");
                    void qc.invalidateQueries({ queryKey: ["espace-classe", "feed", classId] });
                    onBack();
                  } catch (e) {
                    toast.error(errText(e));
                  }
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            ) : (
              <ReportButton classId={classId} userId={userId} targetType="post" targetId={p.id} />
            )}
          </span>
        </div>
      </article>

      <h3 className="text-sm font-bold uppercase tracking-wide text-brand-700">
        {p.replies.length} réponse{p.replies.length > 1 ? "s" : ""}
      </h3>
      <div className="space-y-3">
        {p.replies.map((r) => {
          const isAnswer = r.id === p.answerReplyId;
          return (
            <div key={r.id} className={cn(square, "p-4", isAnswer && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5")}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{r.mine ? "Toi" : r.authorName}</span>
                <span className="text-slate-400">{relativeFr(r.createdAt)}</span>
                {isAnswer ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Réponse choisie
                  </span>
                ) : null}
                {moderator && r.reports ? <span className="inline-flex items-center gap-1 font-semibold text-red-600"><Flag className="h-3.5 w-3.5" /> {r.reports}</span> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{r.body}</p>
              <Photos paths={r.photos} small />
              {r.hidden ? <HiddenNote reason={r.hiddenReason} moderator={moderator} /> : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!moderator ? (
                  <button
                    type="button"
                    disabled={r.mine}
                    onClick={async () => {
                      try {
                        await toggleReaction("reply", r.id, userId, "merci", !r.myMerci);
                        refresh();
                      } catch (e) {
                        toast.error(errText(e));
                      }
                    }}
                    className={cn("inline-flex items-center gap-1 text-xs font-semibold", r.myMerci ? "text-rose-600" : "text-slate-500 hover:text-rose-600", r.mine && "cursor-default")}
                  >
                    <Heart className={cn("h-3.5 w-3.5", r.myMerci && "fill-current")} /> Merci{r.merci ? ` · ${r.merci}` : ""}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">{r.merci} merci</span>
                )}
                {!moderator && p.mine && isQ && !r.mine ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await updatePost(p.id, { answer_reply_id: isAnswer ? null : r.id });
                        refresh();
                      } catch (e) {
                        toast.error(errText(e));
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {isAnswer ? "Retirer « réponse choisie »" : "Cette réponse m’a aidé"}
                  </button>
                ) : null}
                <span className="ml-auto">
                  {moderator ? (
                    <ModerateButton targetType="reply" targetId={r.id} hidden={r.hidden} onDone={refresh} />
                  ) : r.mine ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Supprimer ta réponse ?")) return;
                        try {
                          await deleteReply(r.id);
                          refresh();
                        } catch (e) {
                          toast.error(errText(e));
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  ) : (
                    <ReportButton classId={classId} userId={userId} targetType="reply" targetId={r.id} />
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!moderator && !p.hidden ? (
        <div className={cn(square, "space-y-3 p-4")}>
          <Label htmlFor="space-reply">{isQ ? "Ta réponse" : "Répondre"}</Label>
          <Textarea
            id="space-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={isQ ? "Explique la méthode plutôt que de donner la réponse : tout le monde apprend mieux." : "Écris ta réponse…"}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PhotoPicker classId={classId} userId={userId} value={photos} onChange={setPhotos} max={2} />
            <Button className="rounded-md" onClick={() => void send()} disabled={busy || !reply.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
      <ArrowLeft className="h-4 w-4" /> Retour
    </button>
  );
}

// ---------------------------------------------------------------- groups

/** Classmates to invite (search, tick up to `max`). */
function ClassmatePicker({
  classId,
  exclude,
  max,
  value,
  onChange,
}: {
  classId: string;
  exclude: string[];
  max: number;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: classmates = [] } = useQuery({
    queryKey: ["espace-classe", "classmates", classId],
    queryFn: () => fetchClassmates(classId),
    staleTime: 10 * 60 * 1000,
  });
  const [q, setQ] = useState("");
  const shown = classmates
    .filter((c) => !exclude.includes(c.id))
    .filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) =>
    value.includes(id) ? onChange(value.filter((x) => x !== id)) : value.length < max ? onChange([...value, id]) : toast.error(`${max} camarades au maximum.`);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un camarade" className="pl-9" />
      </div>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <button key={id} type="button" onClick={() => toggle(id)} className="inline-flex items-center gap-1 rounded-md bg-brand-700 px-2 py-1 text-xs font-semibold text-white">
              {classmates.find((c) => c.id === id)?.name ?? "Élève"} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 dark:divide-[var(--border)] dark:border-[var(--border)]">
        {shown.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
            <input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)} className="accent-brand-700" />
            {c.name}
          </label>
        ))}
        {shown.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">Personne ne correspond.</p> : null}
      </div>
      <p className="text-xs text-slate-500">{value.length}/{max} sélectionné{value.length > 1 ? "s" : ""}</p>
    </div>
  );
}

function Groups({
  classId,
  userId,
  subjects,
  moderator,
  onOpen,
  createFor,
  onCreateHandled,
}: {
  classId: string;
  userId: string;
  subjects: SpaceSubject[];
  moderator: boolean;
  onOpen: (id: string) => void;
  createFor: { subjectId: string | null; name: string } | null;
  onCreateHandled: () => void;
}) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["espace-classe", "groups", classId],
    queryFn: () => fetchSpaceGroups(classId),
    refetchInterval: 60_000,
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (createFor) {
      setName(createFor.name);
      setSubjectId(createFor.subjectId ?? "");
      setCreating(true);
      onCreateHandled();
    }
  }, [createFor, onCreateHandled]);
  const create = async () => {
    if (!name.trim()) return toast.error("Donne un nom au groupe.");
    setBusy(true);
    try {
      if (visibility === "private" && invitees.length === 0) {
        setBusy(false);
        return toast.error("Choisis au moins un camarade à inviter.");
      }
      const id = await createGroup({ classId, userId, name, subjectId: subjectId || null, visibility });
      await inviteToGroup(id, userId, invitees);
      if (invitees.length) toast.success(`${invitees.length} invitation${invitees.length > 1 ? "s" : ""} envoyée${invitees.length > 1 ? "s" : ""}`);
      setCreating(false);
      setName("");
      setInvitees([]);
      setVisibility("public");
      void qc.invalidateQueries({ queryKey: ["espace-classe", "groups", classId] });
      onOpen(id);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const answer = async (id: string, accept: boolean) => {
    try {
      await answerInvite(id, accept);
      void qc.invalidateQueries({ queryKey: ["espace-classe", "groups", classId] });
      if (accept) onOpen(id);
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const invitations = data.filter((g) => g.invited && !g.member);
  const join = async (id: string) => {
    try {
      await joinGroup(id, userId);
      void qc.invalidateQueries({ queryKey: ["espace-classe", "groups", classId] });
      onOpen(id);
    } catch (e) {
      toast.error(errText(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300">Des groupes de 2 à 6 pour réviser ou préparer un devoir ensemble : une discussion et une liste de tâches partagée.</p>
        {!moderator ? (
          <Button className="ml-auto rounded-md" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Créer un groupe
          </Button>
        ) : null}
      </div>
      {invitations.map((g) => (
        <div key={`inv-${g.id}`} className={cn(square, "flex flex-wrap items-center gap-3 border-brand-300 bg-brand-50/60 p-4 dark:bg-brand-500/10")}>
          <UserPlus className="h-5 w-5 text-brand-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              <strong>{g.invitedBy ?? "Un camarade"}</strong> t’invite dans <strong>« {g.name} »</strong>
            </p>
            <p className="text-xs text-slate-500">{g.members.map((m) => m.name).join(", ")}</p>
          </div>
          <Button size="sm" variant="outline" className="rounded-md" onClick={() => void answer(g.id, false)}>Refuser</Button>
          <Button size="sm" className="rounded-md" onClick={() => void answer(g.id, true)}>Rejoindre</Button>
        </div>
      ))}
      {isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : data.length === 0 ? (
        <div className={cn(square, "p-8 text-center")}>
          <Users className="mx-auto h-8 w-8 text-brand-600" />
          <p className="mt-3 font-semibold text-slate-900 dark:text-slate-50">Aucun groupe pour le moment</p>
          {!moderator ? <p className="mt-1 text-sm text-slate-500">Crée le premier et invite tes camarades à le rejoindre.</p> : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.filter((g) => !(g.invited && !g.member)).map((g) => (
            <div key={g.id} className={cn(square, "flex flex-col p-4", g.archived && "opacity-70")}>
              <button type="button" className="text-left" onClick={() => (g.member || moderator ? onOpen(g.id) : undefined)}>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {g.subjectName ? <span className="text-brand-700 dark:text-brand-300">{g.subjectName}</span> : null}
                  {g.member ? <span className="rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">Mon groupe</span> : null}
                  {g.visibility === "private" ? (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600"><Lock className="h-3 w-3" /> Sur invitation</span>
                  ) : null}
                  {g.archived ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Terminé</span> : null}
                  <span className="ml-auto font-normal text-slate-400">{relativeFr(g.lastActivityAt)}</span>
                </div>
                <h3 className="mt-1.5 font-bold text-slate-900 dark:text-slate-50">{g.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{g.members.map((m) => (m.id === userId ? "Toi" : m.name)).join(", ")}</p>
              </button>
              <div className="mt-3 flex items-center gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {g.members.length}/6</span>
                {g.tasks ? <span className="inline-flex items-center gap-1"><ListChecks className="h-4 w-4" /> {g.tasksDone}/{g.tasks}</span> : null}
                <span className="ml-auto">
                  {g.member || moderator ? (
                    <Button size="sm" variant="outline" className="rounded-md" onClick={() => onOpen(g.id)}>Ouvrir</Button>
                  ) : !g.archived && g.visibility === "public" && g.members.length + g.pendingInvites < 6 ? (
                    <Button size="sm" className="rounded-md" onClick={() => void join(g.id)}>Rejoindre</Button>
                  ) : (
                    <span className="text-xs">Complet</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={creating} title="Créer un groupe de travail" onClose={() => setCreating(false)}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="g-name">Nom du groupe</Label>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex. : Révisions maths du samedi" />
          </div>
          <div>
            <Label htmlFor="g-subject">Matière</Label>
            <Select id="g-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Toutes matières</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setVisibility("public")} className={cn(square, "p-3 text-left", visibility === "public" && "border-brand-700 ring-1 ring-brand-700")}>
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50"><Users className="h-4 w-4 text-brand-700" /> Public</p>
              <p className="mt-0.5 text-xs text-slate-500">Toute la classe le voit et peut le rejoindre.</p>
            </button>
            <button type="button" onClick={() => setVisibility("private")} className={cn(square, "p-3 text-left", visibility === "private" && "border-brand-700 ring-1 ring-brand-700")}>
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-50"><Lock className="h-4 w-4 text-brand-700" /> Sur invitation</p>
              <p className="mt-0.5 text-xs text-slate-500">Seuls les camarades invités le voient.</p>
            </button>
          </div>
          <div>
            <Label>{visibility === "private" ? "Camarades à inviter" : "Inviter des camarades (facultatif)"}</Label>
            <ClassmatePicker classId={classId} exclude={[userId]} max={5} value={invitees} onChange={setInvitees} />
          </div>
          <p className="text-xs text-slate-500">6 élèves au maximum. Chaque invité reçoit une notification et choisit de rejoindre ou non. L’administration de l’école peut lire le groupe.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-md" onClick={() => setCreating(false)}>Annuler</Button>
            <Button className="rounded-md" onClick={() => void create()} disabled={busy}>Créer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function GroupView({ groupId, classId, userId, moderator, onBack }: { groupId: string; classId: string; userId: string; moderator: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: g, isLoading } = useQuery({
    queryKey: ["espace-classe", "group", groupId],
    queryFn: () => fetchSpaceGroup(groupId),
    refetchInterval: 15_000,
  });
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invitees, setInvitees] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [g?.messages.length]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["espace-classe", "group", groupId] });
    void qc.invalidateQueries({ queryKey: ["espace-classe", "groups", classId] });
  };
  if (isLoading || !g) return <p className="text-sm text-slate-500">Chargement…</p>;
  const canWrite = !moderator && g.member && !g.archived;
  const room = 6 - g.members.length - g.pending.length;
  const invite = async () => {
    try {
      await inviteToGroup(g.id, userId, invitees);
      toast.success(`${invitees.length} invitation${invitees.length > 1 ? "s" : ""} envoyée${invitees.length > 1 ? "s" : ""}`);
      setInvitees([]);
      setInviting(false);
      refresh();
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await sendGroupMessage(g.id, userId, text, photos);
      setText("");
      setPhotos([]);
      refresh();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />
      <div className={cn(square, "flex flex-wrap items-center gap-3 p-4")}>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{g.subjectName ?? "Groupe de travail"}</p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{g.name}</h2>
          <p className="text-sm text-slate-500">{g.members.map((m) => (m.id === userId ? "Toi" : m.name)).join(", ")}</p>
          {g.pending.length ? <p className="text-xs text-slate-400">Invité{g.pending.length > 1 ? "s" : ""} : {g.pending.map((m: SpaceMember) => m.name).join(", ")}</p> : null}
          {g.visibility === "private" ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Lock className="h-3 w-3" /> Sur invitation</p> : null}
        </div>
        {!moderator && g.invited && !g.member ? (
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-md"
              onClick={async () => {
                try {
                  await answerInvite(g.id, false);
                  void qc.invalidateQueries({ queryKey: ["espace-classe", "groups", classId] });
                  onBack();
                } catch (e) {
                  toast.error(errText(e));
                }
              }}
            >
              Refuser
            </Button>
            <Button
              size="sm"
              className="rounded-md"
              onClick={async () => {
                try {
                  await answerInvite(g.id, true);
                  refresh();
                } catch (e) {
                  toast.error(errText(e));
                }
              }}
            >
              Rejoindre
            </Button>
          </div>
        ) : null}
        {!moderator && g.member ? (
          <div className="ml-auto flex gap-2">
            {canWrite && room > 0 ? (
              <Button size="sm" className="rounded-md" onClick={() => setInviting(true)}>
                <UserPlus className="h-4 w-4" /> Inviter
              </Button>
            ) : null}
            {g.mine ? (
              <Button
                size="sm"
                variant="outline"
                className="rounded-md"
                onClick={async () => {
                  try {
                    await archiveGroup(g.id, !g.archived);
                    refresh();
                  } catch (e) {
                    toast.error(errText(e));
                  }
                }}
              >
                {g.archived ? "Rouvrir" : "Terminer le groupe"}
              </Button>
            ) : null}
            {g.member ? (
              <Button
                size="sm"
                variant="ghost"
                className="rounded-md"
                onClick={async () => {
                  if (!window.confirm("Quitter ce groupe ?")) return;
                  try {
                    await leaveGroup(g.id, userId);
                    void qc.invalidateQueries({ queryKey: ["espace-classe", "groups", classId] });
                    onBack();
                  } catch (e) {
                    toast.error(errText(e));
                  }
                }}
              >
                Quitter
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Modal open={inviting} title={`Inviter dans « ${g.name} »`} onClose={() => setInviting(false)}>
        <div className="space-y-4">
          <ClassmatePicker
            classId={classId}
            exclude={[...g.members.map((m) => m.id), ...g.pending.map((m) => m.id)]}
            max={Math.max(room, 0)}
            value={invitees}
            onChange={setInvitees}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-md" onClick={() => setInviting(false)}>Annuler</Button>
            <Button className="rounded-md" onClick={() => void invite()} disabled={invitees.length === 0}>
              <Send className="h-4 w-4" /> Envoyer les invitations
            </Button>
          </div>
        </div>
      </Modal>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className={cn(square, "flex flex-col lg:col-span-8")}>
          <div className="max-h-[28rem] min-h-[16rem] flex-1 space-y-3 overflow-y-auto p-4">
            {g.messages.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Aucun message. Lance la discussion !</p> : null}
            {g.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-md px-3 py-2", m.mine ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-800 dark:bg-white/5 dark:text-slate-100")}>
                  {!m.mine ? <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{m.authorName}</p> : null}
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  <Photos paths={m.photos} small />
                  {m.hidden ? <HiddenNote reason={m.hiddenReason} moderator={moderator} /> : null}
                  <div className={cn("mt-1 flex items-center gap-3 text-[11px]", m.mine ? "text-white/70" : "text-slate-400")}>
                    {format(new Date(m.createdAt), "d MMM HH:mm", { locale: fr })}
                    {moderator ? (
                      <ModerateButton targetType="group_message" targetId={m.id} hidden={m.hidden} onDone={refresh} />
                    ) : !m.mine ? (
                      <ReportButton classId={classId} userId={userId} targetType="group_message" targetId={m.id} />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          {canWrite ? (
            <div className="space-y-2 border-t border-slate-100 p-3 dark:border-[var(--border)]">
              <div className="flex gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => (e.key === "Enter" && !e.shiftKey ? (e.preventDefault(), void send()) : undefined)}
                  placeholder="Écrire au groupe…"
                  maxLength={2000}
                />
                <Button className="rounded-md" onClick={() => void send()} disabled={busy || !text.trim()} aria-label="Envoyer">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <PhotoPicker classId={classId} userId={userId} value={photos} onChange={setPhotos} max={2} />
            </div>
          ) : null}
        </section>

        <section className={cn(square, "p-4 lg:col-span-4")}>
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-700">
            <ListChecks className="h-4 w-4" /> À faire ensemble
          </h3>
          <ul className="mt-3 space-y-2">
            {g.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={!canWrite}
                  onChange={async () => {
                    try {
                      await updateTask(t.id, { done_at: t.done ? null : new Date().toISOString() });
                      refresh();
                    } catch (e) {
                      toast.error(errText(e));
                    }
                  }}
                  className="mt-0.5 accent-brand-700"
                />
                <span className="min-w-0 flex-1">
                  <span className={cn(t.done && "text-slate-400 line-through")}>{t.label}</span>
                  {t.assigneeName ? <span className="block text-xs text-slate-500">{t.assigneeId === userId ? "Toi" : t.assigneeName}</span> : null}
                </span>
                {canWrite ? (
                  <span className="flex gap-1">
                    {!t.assigneeId ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-700"
                        onClick={async () => {
                          try {
                            await updateTask(t.id, { assignee_id: userId });
                            refresh();
                          } catch (e) {
                            toast.error(errText(e));
                          }
                        }}
                      >
                        Je m’en charge
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Retirer"
                      onClick={async () => {
                        try {
                          await deleteTask(t.id);
                          refresh();
                        } catch (e) {
                          toast.error(errText(e));
                        }
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
            {g.tasks.length === 0 ? <li className="text-sm text-slate-500">Partagez le travail : « Partie 1 », « Chapitre 3 »…</li> : null}
          </ul>
          {canWrite ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!task.trim()) return;
                try {
                  await addTask(g.id, userId, task);
                  setTask("");
                  refresh();
                } catch (err) {
                  toast.error(errText(err));
                }
              }}
            >
              <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Ajouter une tâche" maxLength={140} className="!h-9" />
              <Button type="submit" size="sm" className="rounded-md" aria-label="Ajouter"><Plus className="h-4 w-4" /></Button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- révisions

function Revisions({
  compositions,
  subjects,
  onFiches,
  onAsk,
  onGroup,
}: {
  compositions: SpaceComposition[];
  subjects: SpaceSubject[];
  onFiches: (subjectId: string | null) => void;
  onAsk: (subjectId: string | null) => void;
  onGroup: (subjectId: string | null, name: string) => void;
}) {
  if (compositions.length === 0) {
    return (
      <div className={cn(square, "p-8 text-center")}>
        <Sparkles className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-3 font-semibold text-slate-900 dark:text-slate-50">Pas de composition dans les 45 prochains jours</p>
        <p className="mt-1 text-sm text-slate-500">Quand l’école programme les compositions, tu retrouves ici le compte à rebours et les révisions par matière.</p>
      </div>
    );
  }
  const today = new Date();
  return (
    <div className="space-y-6">
      {compositions.map((c) => {
        const start = new Date(`${c.startsOn}T00:00:00`);
        const days = differenceInCalendarDays(start, today);
        const running = days <= 0;
        const bySubject = new Map<string, { name: string; date: string | null; start: string | null }>();
        for (const p of c.papers) {
          if (!p.subjectId) continue;
          if (!bySubject.has(p.subjectId)) bySubject.set(p.subjectId, { name: p.subjectName ?? "Matière", date: p.date, start: p.start });
        }
        const list = bySubject.size ? [...bySubject.entries()] : subjects.map((s) => [s.id, { name: s.name, date: null, start: null }] as const);
        return (
          <section key={c.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 rounded-md bg-gradient-to-br from-brand-800 to-brand-600 p-5 text-white">
              <div className="flex h-16 w-16 flex-col items-center justify-center rounded-md bg-white/15">
                <span className="text-2xl font-bold leading-none">{running ? "En cours" : `J-${days}`}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{c.periodLabel ?? "Compositions"}</p>
                <h2 className="text-lg font-bold">{c.title ?? "Compositions"}</h2>
                <p className="text-sm text-white/85">
                  {c.endsOn && c.endsOn !== c.startsOn
                    ? `Du ${format(start, "EEEE d MMMM", { locale: fr })} au ${format(new Date(`${c.endsOn}T00:00:00`), "EEEE d MMMM", { locale: fr })}`
                    : `Le ${format(start, "EEEE d MMMM", { locale: fr })}`}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map(([id, s]) => (
                <div key={id} className={cn(square, "p-4")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-slate-50">{s.name}</h3>
                    {s.date ? (
                      <span className="text-xs font-semibold text-brand-700">
                        {format(new Date(`${s.date}T00:00:00`), "EEE d MMM", { locale: fr })}
                        {s.start ? ` · ${timeFr(s.start)}` : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-md" onClick={() => onFiches(id)}>
                      <NotebookPen className="h-4 w-4" /> Fiches
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-md" onClick={() => onAsk(id)}>
                      <CircleHelp className="h-4 w-4" /> Poser une question
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-md" onClick={() => onGroup(id, `Révisions ${s.name}`)}>
                      <Users className="h-4 w-4" /> Réviser en groupe
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- the space

export function ClassSpace({
  classId,
  userId,
  subjects,
  compositions,
  moderator = false,
}: {
  classId: string;
  userId: string;
  subjects: SpaceSubject[];
  compositions: SpaceComposition[];
  moderator?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("onglet") as Tab | null) ?? "discussions";
  const postId = params.get("sujet");
  const groupId = params.get("groupe");
  const [composer, setComposer] = useState<{ kind: PostKind; subjectId: string | null; evaluation: { id: string; title: string } | null } | null>(null);
  const [createGroupFor, setCreateGroupFor] = useState<{ subjectId: string | null; name: string } | null>(null);

  const set = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    setParams(p, { replace: false });
  };

  // « Discuter » from Exercices: /espace-classe?nouveau=question&exercice=<id>&titre=…&matiere=…
  useEffect(() => {
    if (moderator || params.get("nouveau") !== "question") return;
    setComposer({
      kind: "question",
      subjectId: params.get("matiere"),
      evaluation: params.get("exercice") ? { id: params.get("exercice")!, title: params.get("titre") ?? "Exercice" } : null,
    });
    const p = new URLSearchParams(params);
    ["nouveau", "exercice", "titre", "matiere"].forEach((k) => p.delete(k));
    setParams(p, { replace: true });
  }, [moderator, params, setParams]);

  const soon = useMemo(
    () => compositions.some((c) => differenceInCalendarDays(new Date(`${c.startsOn}T00:00:00`), new Date()) <= 21),
    [compositions],
  );

  if (postId) return <PostView postId={postId} classId={classId} userId={userId} moderator={moderator} onBack={() => set({ sujet: null })} />;
  if (groupId) return <GroupView groupId={groupId} classId={classId} userId={userId} moderator={moderator} onBack={() => set({ groupe: null })} />;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    { key: "discussions", label: "Questions & discussions", icon: <MessagesSquare className="h-4 w-4" /> },
    { key: "fiches", label: "Fiches de révision", icon: <NotebookPen className="h-4 w-4" /> },
    { key: "groupes", label: "Groupes de travail", icon: <Users className="h-4 w-4" /> },
    { key: "revisions", label: "Révisions", icon: <Sparkles className="h-4 w-4" />, badge: soon },
  ];

  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={chip(tab === t.key)} onClick={() => set({ onglet: t.key === "discussions" ? null : t.key })}>
            {t.icon}
            {t.label}
            {t.badge ? <span className="h-2 w-2 rounded-full bg-faso-red" aria-label="Compositions bientôt" /> : null}
          </button>
        ))}
      </div>

      {tab === "discussions" ? (
        <Feed
          classId={classId}
          userId={userId}
          subjects={subjects}
          moderator={moderator}
          kind="discussions"
          onOpen={(id) => set({ sujet: id })}
          onCompose={(kind, subjectId) => setComposer({ kind, subjectId: subjectId ?? null, evaluation: null })}
        />
      ) : tab === "fiches" ? (
        <Feed
          classId={classId}
          userId={userId}
          subjects={subjects}
          moderator={moderator}
          kind="fiche"
          onOpen={(id) => set({ sujet: id })}
          onCompose={(kind, subjectId) => setComposer({ kind, subjectId: subjectId ?? null, evaluation: null })}
        />
      ) : tab === "groupes" ? (
        <Groups
          classId={classId}
          userId={userId}
          subjects={subjects}
          moderator={moderator}
          onOpen={(id) => set({ groupe: id })}
          createFor={createGroupFor}
          onCreateHandled={() => setCreateGroupFor(null)}
        />
      ) : (
        <Revisions
          compositions={compositions}
          subjects={subjects}
          onFiches={() => set({ onglet: "fiches" })}
          onAsk={(subjectId) => setComposer({ kind: "question", subjectId, evaluation: null })}
          onGroup={(subjectId, name) => {
            if (moderator) return;
            set({ onglet: "groupes" });
            setCreateGroupFor({ subjectId, name });
          }}
        />
      )}

      {!moderator && composer ? (
        <Composer
          open
          onClose={() => setComposer(null)}
          classId={classId}
          userId={userId}
          subjects={subjects}
          initialKind={composer.kind}
          initialSubject={composer.subjectId}
          evaluation={composer.evaluation}
          onCreated={(id) => set({ sujet: id })}
        />
      ) : null}
    </div>
  );
}
