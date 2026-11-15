import { Link } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck, Hourglass, MessageSquare, NotebookPen } from "lucide-react";
import { lessonHours, lessonPath, type Lesson } from "@/hooks/useTeacherLessons";
import { useTeacherTodo } from "@/hooks/useTeacherTodo";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/weekGrid";
import { PageBanner } from "@/components/PageBanner";
import { Card } from "@/components/ui";

const shortDay = (d: string) => format(new Date(`${d}T12:00:00`), "EEE d MMM", { locale: fr });

/** Teacher task inbox: everything still to do, each with a button to the right screen. */
export default function AFaire() {
  const now = useNow(60_000);
  const t = useTeacherTodo(now);
  const total = t.count;

  return (
    <div>
      <PageBanner
        title="À faire"
        subtitle={total === 0 ? "Tout est à jour. Bravo !" : `${total} tâche${total > 1 ? "s" : ""} en attente`}
        stats={[
          { label: "Appels", value: String(t.lateAppels.length), hint: "à faire" },
          { label: "Cahiers", value: String(t.lateCahiers.length), hint: "à remplir" },
          { label: "Notes", value: String(t.ungraded.length), hint: "évaluations à noter" },
        ]}
      />

      {t.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-[var(--surface-2)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Group icon={ClipboardCheck} title="Appels à faire" hint="Cours commencés ou terminés sans appel validé" count={t.lateAppels.length} empty="Tous les appels sont faits.">
            {t.lateAppels.map((l) => (
              <LessonItem key={l.key} lesson={l} cta="Faire l’appel" tab="appel" />
            ))}
          </Group>

          <Group icon={BookOpenCheck} title="Cahiers de textes à remplir" hint="Cours terminés sans cahier de textes" count={t.lateCahiers.length} empty="Tous les cahiers sont remplis.">
            {t.lateCahiers.map((l) => (
              <LessonItem key={l.key} lesson={l} cta="Remplir" tab="cahier" />
            ))}
          </Group>

          <Group icon={NotebookPen} title="Notes à saisir" hint="Interrogations et examens passés sans toutes les notes" count={t.ungraded.length} empty="Toutes les notes sont saisies.">
            {t.ungraded.map((e) => (
              <Item
                key={e.id}
                to={`/classes/${e.classId}/notes/${e.id}`}
                title={e.title}
                meta={`${evaluationTypeLabel(e.type)} · ${e.subjectName} · ${e.className} · ${shortDay(e.evalDate)}`}
                badge={`${e.missing} note${e.missing > 1 ? "s" : ""} manquante${e.missing > 1 ? "s" : ""}`}
                cta="Saisir"
              />
            ))}
          </Group>

          <div className="space-y-6">
            <Group icon={Hourglass} title="Examens en attente" hint="Proposés, en attente de confirmation par l’administration" count={t.pendingExams.length} empty="Aucun examen en attente." muted>
              {t.pendingExams.map((e) => (
                <Item
                  key={e.id}
                  to={`/classes/${e.classId}/notes?subject=${e.subjectId}`}
                  title={e.title}
                  meta={`${e.subjectName} · ${e.className}${e.evalDate ? ` · ${shortDay(e.evalDate)}` : ""}`}
                  cta="Voir"
                  quiet
                />
              ))}
            </Group>

            <Card>
              <Link to="/messages" className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900 dark:text-slate-50">Messages</span>
                  <span className="block text-xs text-slate-500">
                    {t.unreadMessages ? `${t.unreadMessages} non lu${t.unreadMessages > 1 ? "s" : ""}` : "Tout est lu"}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </Link>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  hint,
  count,
  empty,
  muted,
  children,
}: {
  icon: typeof ClipboardCheck;
  title: string;
  hint: string;
  count: number;
  empty: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-[var(--border)]">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md",
            count === 0
              ? "bg-emerald-50 text-emerald-700"
              : muted
                ? "bg-slate-100 text-slate-600"
                : "bg-amber-50 text-amber-700",
          )}
        >
          {count === 0 ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <p className="truncate text-xs text-slate-500">{hint}</p>
        </div>
        <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto dark:divide-[var(--border)]">{children}</ul>
      )}
    </Card>
  );
}

function LessonItem({ lesson: l, cta, tab }: { lesson: Lesson; cta: string; tab: "appel" | "cahier" }) {
  return (
    <Item
      to={lessonPath(l, tab)}
      title={`${l.subjectName} · ${l.className}`}
      meta={`${shortDay(l.date)} · ${lessonHours(l)}`}
      cta={cta}
    />
  );
}

function Item({
  to,
  title,
  meta,
  badge,
  cta,
  quiet,
}: {
  to: string;
  title: string;
  meta: string;
  badge?: string;
  cta: string;
  quiet?: boolean;
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="block truncate text-xs capitalize text-slate-500">{meta}</span>
          {badge ? <span className="mt-1 inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">{badge}</span> : null}
        </span>
        <span
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-semibold",
            quiet ? "border border-slate-200 text-slate-700 dark:border-[var(--border)] dark:text-slate-200" : "bg-brand-700 text-white",
          )}
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </li>
  );
}
