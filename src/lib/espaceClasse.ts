import { supabase } from "@/lib/supabase";

/*
 * « Espace classe »: the students of one class (secondaire) help each other.
 * Reads go through one RPC per screen (names, counts and visibility are decided by the
 * database); writes go straight to the tables, row-level security decides who may write.
 */

export type SpaceSubject = { id: string; name: string };
export type SpacePaper = { subjectId: string | null; subjectName: string | null; date: string | null; start: string | null; end: string | null };
export type SpaceComposition = {
  id: string;
  title: string | null;
  periodLabel: string | null;
  startsOn: string;
  endsOn: string | null;
  papers: SpacePaper[];
};

export type SpaceContext =
  | {
      enabled: true;
      classId: string;
      className: string;
      gradeLevel: string;
      classmates: number;
      subjects: SpaceSubject[];
      compositions: SpaceComposition[];
    }
  | { enabled: false; reason: "auth" | "inscription" | "primaire" | "module" };

export type PostKind = "question" | "discussion" | "fiche";

export type SpacePostSummary = {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
  photos: string[];
  subjectId: string | null;
  subjectName: string | null;
  evaluationId: string | null;
  evaluationTitle: string | null;
  authorId: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
  lastActivityAt: string;
  answered: boolean;
  replies: number;
  moiAussi: number;
  utile: number;
  myReactions: string[];
  hidden: boolean;
  hiddenReason: string | null;
  reports: number | null;
};

export type SpaceReply = {
  id: string;
  body: string;
  photos: string[];
  authorId: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
  editedAt: string | null;
  hidden: boolean;
  hiddenReason: string | null;
  merci: number;
  myMerci: boolean;
  reports: number | null;
};

export type SpacePost = Omit<SpacePostSummary, "lastActivityAt" | "answered" | "replies" | "reports"> & {
  classId: string;
  editedAt: string | null;
  answerReplyId: string | null;
  replies: SpaceReply[];
};

export type SpaceMember = { id: string; name: string };

export type SpaceGroupSummary = {
  id: string;
  name: string;
  subjectId: string | null;
  subjectName: string | null;
  evaluationId: string | null;
  evaluationTitle: string | null;
  evaluationDate: string | null;
  createdBy: string;
  mine: boolean;
  archived: boolean;
  lastActivityAt: string;
  member: boolean;
  members: SpaceMember[];
  tasks: number;
  tasksDone: number;
};

export type SpaceTask = { id: string; label: string; assigneeId: string | null; assigneeName: string | null; done: boolean };
export type SpaceGroupMessage = {
  id: string;
  body: string;
  photos: string[];
  authorId: string;
  authorName: string;
  mine: boolean;
  createdAt: string;
  hidden: boolean;
  hiddenReason: string | null;
};

export type SpaceGroup = {
  id: string;
  classId: string;
  name: string;
  subjectId: string | null;
  subjectName: string | null;
  evaluationId: string | null;
  evaluationTitle: string | null;
  createdBy: string;
  mine: boolean;
  member: boolean;
  archived: boolean;
  members: SpaceMember[];
  tasks: SpaceTask[];
  messages: SpaceGroupMessage[];
};

export type SpaceReport = {
  targetType: "post" | "reply" | "group_message";
  targetId: string;
  classId: string;
  className: string;
  count: number;
  reasons: string[];
  firstAt: string;
  handled: boolean;
  text: string | null;
  authorName: string | null;
  postId: string | null;
  groupId: string | null;
  hidden: boolean | null;
};

export type SpaceSchoolClass = {
  classId: string;
  name: string;
  gradeLevel: string;
  posts: number;
  postsWeek: number;
  groups: number;
  openReports: number;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------- reading

export const fetchSpaceContext = () => rpc<SpaceContext>("ef_space_context");

export const fetchSpaceFeed = (classId: string, kind: "discussions" | "question" | "discussion" | "fiche" | null, subjectId: string | null) =>
  rpc<SpacePostSummary[]>("ef_space_feed", { p_class: classId, p_kind: kind, p_subject: subjectId, p_limit: 60 });

export const fetchSpacePost = (postId: string) => rpc<SpacePost>("ef_space_post", { p_post: postId });

export const fetchSpaceGroups = (classId: string) => rpc<SpaceGroupSummary[]>("ef_space_groups_list", { p_class: classId });

export const fetchSpaceGroup = (groupId: string) => rpc<SpaceGroup>("ef_space_group", { p_group: groupId });

export const fetchSpaceReports = (schoolId: string, open: boolean) =>
  rpc<SpaceReport[]>("ef_space_reports_list", { p_school: schoolId, p_open: open });

export const fetchSpaceSchoolClasses = (schoolId: string) =>
  rpc<SpaceSchoolClass[]>("ef_space_school_classes", { p_school: schoolId });

// ---------------------------------------------------------------- writing

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function createPost(input: {
  classId: string;
  authorId: string;
  kind: PostKind;
  subjectId: string | null;
  evaluationId?: string | null;
  title: string;
  body: string;
  photos: string[];
}) {
  const row = await must(
    supabase
      .from("ef_space_posts")
      .insert({
        class_id: input.classId,
        author_id: input.authorId,
        kind: input.kind,
        subject_id: input.subjectId,
        evaluation_id: input.evaluationId ?? null,
        title: input.title.trim(),
        body: input.body.trim(),
        photos: input.photos,
      })
      .select("id")
      .single(),
  );
  return (row as { id: string }).id;
}

export const updatePost = (postId: string, patch: { title?: string; body?: string; answer_reply_id?: string | null }) =>
  must(supabase.from("ef_space_posts").update(patch).eq("id", postId));

export const deletePost = (postId: string) => must(supabase.from("ef_space_posts").delete().eq("id", postId));

export const createReply = (postId: string, authorId: string, body: string, photos: string[]) =>
  must(supabase.from("ef_space_replies").insert({ post_id: postId, author_id: authorId, body: body.trim(), photos }));

export const deleteReply = (replyId: string) => must(supabase.from("ef_space_replies").delete().eq("id", replyId));

export async function toggleReaction(
  targetType: "post" | "reply",
  targetId: string,
  userId: string,
  kind: "moi_aussi" | "utile" | "merci",
  on: boolean,
) {
  if (on) {
    await must(supabase.from("ef_space_reactions").insert({ target_type: targetType, target_id: targetId, user_id: userId, kind }));
  } else {
    await must(
      supabase
        .from("ef_space_reactions")
        .delete()
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .eq("user_id", userId)
        .eq("kind", kind),
    );
  }
}

export async function createGroup(input: { classId: string; userId: string; name: string; subjectId: string | null; evaluationId?: string | null }) {
  const row = await must(
    supabase
      .from("ef_space_groups")
      .insert({
        class_id: input.classId,
        created_by: input.userId,
        name: input.name.trim(),
        subject_id: input.subjectId,
        evaluation_id: input.evaluationId ?? null,
      })
      .select("id")
      .single(),
  );
  return (row as { id: string }).id;
}

export const joinGroup = (groupId: string, userId: string) =>
  must(supabase.from("ef_space_group_members").insert({ group_id: groupId, user_id: userId }));

export const leaveGroup = (groupId: string, userId: string) =>
  must(supabase.from("ef_space_group_members").delete().eq("group_id", groupId).eq("user_id", userId));

export const archiveGroup = (groupId: string, archived: boolean) =>
  must(supabase.from("ef_space_groups").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", groupId));

export const sendGroupMessage = (groupId: string, authorId: string, body: string, photos: string[]) =>
  must(supabase.from("ef_space_group_messages").insert({ group_id: groupId, author_id: authorId, body: body.trim(), photos }));

export const addTask = (groupId: string, userId: string, label: string) =>
  must(supabase.from("ef_space_tasks").insert({ group_id: groupId, created_by: userId, label: label.trim() }));

export const updateTask = (taskId: string, patch: { done_at?: string | null; assignee_id?: string | null }) =>
  must(supabase.from("ef_space_tasks").update(patch).eq("id", taskId));

export const deleteTask = (taskId: string) => must(supabase.from("ef_space_tasks").delete().eq("id", taskId));

export const reportContent = (classId: string, targetType: "post" | "reply" | "group_message", targetId: string, reporterId: string, reason: string) =>
  must(
    supabase.from("ef_space_reports").insert({
      class_id: classId,
      target_type: targetType,
      target_id: targetId,
      reporter_id: reporterId,
      reason: reason.trim(),
    }),
  );

export const moderate = (targetType: "post" | "reply" | "group_message", targetId: string, hide: boolean, reason?: string) =>
  rpc<void>("ef_space_moderate", { p_target_type: targetType, p_target_id: targetId, p_hide: hide, p_reason: reason ?? null });

// ---------------------------------------------------------------- photos

const BUCKET = "espace-classe";

/** Resizes to 1600 px max (JPEG), so photos stay light on slow connections. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choisis une image.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("Image illisible.");
  return blob;
}

/** Uploads a photo of the class space; returns its storage path. */
export async function uploadSpacePhoto(classId: string, userId: string, file: File): Promise<string> {
  const blob = await shrink(file);
  const path = `${classId}/${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

/** Signed links (1 hour) for photos of the class space. */
export async function signSpacePhotos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) return {};
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export const KIND_LABEL: Record<PostKind, string> = {
  question: "Question",
  discussion: "Discussion",
  fiche: "Fiche",
};

export const REPORT_REASONS = [
  "Insulte ou moquerie",
  "Contenu inapproprié",
  "Réponses d’un devoir à copier",
  "Hors sujet ou publicité",
  "Autre",
];
