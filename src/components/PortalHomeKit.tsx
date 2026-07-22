import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { LucideIcon } from "lucide-react";
import { Megaphone, MessageSquare } from "lucide-react";
import { parseValidDate } from "@/lib/dateFr";
import { getTimeGreeting } from "@/lib/greeting";
import { cn } from "@/lib/utils";
import { Button, Card } from "@/components/ui";
import type { UnreadInboxCounts } from "@/hooks/useUnreadMessagesCount";
import { EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";

export function relativeFr(iso: string | null | undefined) {
  const d = parseValidDate(iso);
  if (!d) return "—";
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: fr });
  } catch {
    return "—";
  }
}

export function snippet(text: string, max = 72) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function MetricCard({
  label,
  value,
  hint,
  valueClass,
  to,
}: {
  label: string;
  value: string;
  hint: string;
  valueClass: string;
  to: string;
}) {
  return (
    <Link to={to} className="block h-full">
      <Card className="h-full border-slate-200/80 py-4 transition hover:border-brand-300 hover:shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {label}
        </p>
        <p className={cn("mt-2 text-3xl font-bold tracking-tight", valueClass)}>
          {value}
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{hint}</p>
      </Card>
    </Link>
  );
}

export function Panel({
  icon: Icon,
  title,
  subtitle,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col border-slate-200/80 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">{subtitle}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <div className="mt-4">{action}</div>
    </Card>
  );
}

export function PanelEmpty({ message }: { message: string }) {
  return (
    <div className="flex min-h-[7.5rem] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 px-4 py-6 text-center text-sm font-medium text-slate-600 dark:border-slate-500 dark:bg-[var(--surface-2)] dark:text-slate-200">
      {message}
    </div>
  );
}

export function PortalHomeHeader({
  icon: Icon,
  name,
  context,
  unreadInbox = EMPTY_UNREAD_INBOX,
}: {
  icon: LucideIcon;
  name: string;
  context: string;
  unreadInbox?: UnreadInboxCounts;
}) {
  const displayName = name.trim();
  const { discussions, announcements } = unreadInbox;

  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-teal-600 text-white shadow-lg shadow-brand-900/20">
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-medium text-brand-700">
            {getTimeGreeting()}{" "}
            <span className="animate-greeting-wave inline-block" aria-hidden>
              👋
            </span>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {displayName || (
              <span className="inline-block h-8 w-40 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
            )}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {context}
          </p>
        </div>
      </div>
      {discussions > 0 || announcements > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {discussions > 0 ? (
            <Link to="/messages">
              <Button className="w-full sm:w-auto">
                <MessageSquare className="h-4 w-4" />
                {discussions} message{discussions > 1 ? "s" : ""} non lu
                {discussions > 1 ? "s" : ""}
              </Button>
            </Link>
          ) : null}
          {announcements > 0 ? (
            <Link to="/annonces">
              <Button variant="secondary" className="w-full sm:w-auto">
                <Megaphone className="h-4 w-4" />
                {announcements} annonce{announcements > 1 ? "s" : ""} non lue
                {announcements > 1 ? "s" : ""}
              </Button>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function QuickLink({
  to,
  label,
  icon: Icon,
  badge,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional count bubble (e.g. pending exams). */
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:border-brand-300 hover:text-brand-800 dark:hover:text-brand-300"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {badge != null && badge > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
          title={`${badge} en attente`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export type InboxPreview = {
  id: string;
  subject: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
  is_announcement: boolean;
  sender: { first_name: string; last_name: string } | null;
};
