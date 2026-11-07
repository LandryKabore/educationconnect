import type { ReactNode } from "react";
import { Bell, BookOpen, ClipboardList, MessageSquare } from "lucide-react";
import { Panel } from "@/components/PortalHomeKit";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { getTimeGreeting } from "@/lib/greeting";
import { cn, personName } from "@/lib/utils";
import { PARENT_QUICK_LINKS } from "@/pages/parent/parentQuickLinks";

/** Shared with the loaded cards so a pulse block keeps the same box. */
const SKELETON_PULSE =
  "skeleton-pulse animate-pulse bg-slate-200 motion-reduce:animate-none dark:bg-slate-700";

const CARD_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300";

/** Two chips: the row height matches 1–3 children (they stay on one line at 375 and 1280). */
const PLACEHOLDER_CHILDREN = 2;
/** ~4 school weeks. Two rows of squares ≈ the loaded strip. */
const PLACEHOLDER_STRIP_DAYS = 20;
/** Two list rows ≈ the empty-panel floor (7.5rem) and a short loaded list. */
const PLACEHOLDER_LIST_ROWS = 2;

function Pulse({ className }: { className?: string }) {
  return <span className={cn("block rounded", SKELETON_PULSE, className)} />;
}

export function ParentHomeHeader({
  name,
  schoolName,
}: {
  name: string;
  schoolName?: string | null;
}) {
  return (
    <header>
      <p className="text-sm font-medium text-brand-700">
        {getTimeGreeting()}{" "}
        <span className="animate-greeting-wave inline-block" aria-hidden>
          👋
        </span>
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
        {name || <Pulse className="inline-block h-8 w-40 rounded-md" />}
      </h1>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        {[schoolName, "Parent"].filter(Boolean).join(" · ")}
      </p>
    </header>
  );
}

function ChildChipSkeleton({ selected }: { selected: boolean }) {
  return (
    <div
      className={cn(
        "relative flex min-h-[3.5rem] min-w-[13rem] shrink-0 items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm md:min-w-0 md:shrink",
        selected
          ? "border-navy-700 ring-2 ring-navy-700/20 dark:border-brand-400 dark:ring-brand-400/30"
          : "border-slate-200 dark:border-slate-600",
      )}
    >
      <Pulse className="h-11 w-11 shrink-0 rounded-full" />
      <span className="min-w-0 w-32 space-y-1.5 md:w-auto md:flex-1">
        <Pulse className="h-5 w-24" />
        <Pulse className="h-4 w-28" />
      </span>
      <span className="hidden shrink-0 gap-3 md:flex">
        {["moy.", "prés.", "à faire"].map((label) => (
          <span key={label} className="text-center">
            <Pulse className="h-5 w-8" />
            <span className="mt-0.5 block text-[10px] text-transparent">{label}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/** Ring is h-20 w-20, same box as ProgressRing. */
function RingSkeleton() {
  return <Pulse className="h-20 w-20 shrink-0 rounded-full" />;
}

export function AverageCardBodySkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Chargement des moyennes</p>
      <div aria-hidden="true">
        <p className={CARD_LABEL}>Moyennes · année</p>
        <div className="mt-2 flex items-center gap-3">
          <RingSkeleton />
          <div className="min-w-0 space-y-2">
            <Pulse className="h-4 w-28" />
            <Pulse className="h-4 w-16" />
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          {["T1", "T2", "T3"].map((label) => (
            <div key={label} className="rounded-lg bg-slate-50 px-1 py-1.5 dark:bg-slate-800">
              <dt className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-300">
                {label}
              </dt>
              <dd className="flex justify-center">
                <Pulse className="h-5 w-8" />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function PresenceCardBodySkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Chargement de la présence</p>
      <div aria-hidden="true">
        <p className={CARD_LABEL}>Présence</p>
        <div className="mt-2 flex items-center gap-3">
          <RingSkeleton />
          <div className="min-w-0 space-y-2">
            <Pulse className="h-4 w-20" />
            <Pulse className="h-4 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function StripBodySkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Chargement de l’assiduité</p>
      <div aria-hidden="true">
        <div className="mt-3 flex flex-wrap gap-1">
          {Array.from({ length: PLACEHOLDER_STRIP_DAYS }, (_, i) => (
            <Pulse key={i} className="h-4 w-4 rounded-[4px]" />
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
          Vert présent · rouge absent · jaune retard · bleu justifié (un carré par jour de classe)
        </p>
      </div>
    </div>
  );
}

/** Title + subtitle + pill, same row as a homework or grade line (min-h-11, py-2). */
export function DetailRowSkeleton() {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-[var(--surface-2)]">
      <div className="min-w-0 flex-1 space-y-1">
        <Pulse className="h-5 w-4/5 max-w-48" />
        <Pulse className="h-4 w-24" />
      </div>
      <Pulse className="h-5 w-16 shrink-0 rounded-full" />
    </div>
  );
}

/** Sender, subject, snippet — same stack as a message line (px-3 py-2.5). */
export function MessageRowSkeleton() {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-[var(--surface-2)]">
      <div className="flex items-start justify-between gap-2">
        <Pulse className="h-5 w-32" />
        <Pulse className="h-3 w-14 shrink-0" />
      </div>
      <Pulse className="mt-0.5 h-5 w-3/5 max-w-40" />
      <Pulse className="mt-0.5 h-4 w-4/5 max-w-56" />
    </div>
  );
}

export function AnnouncementRowSkeleton() {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-[var(--surface-2)]">
      <div className="flex items-start justify-between gap-2">
        <Pulse className="h-5 w-40 max-w-[70%]" />
        <Pulse className="h-3 w-14 shrink-0" />
      </div>
      <Pulse className="mt-1 h-4 w-full max-w-md" />
      <Pulse className="mt-1 h-4 w-4/5 max-w-sm" />
    </div>
  );
}

function RowStack({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true">
      <p className="sr-only">Chargement</p>
      <div className="space-y-2" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

export function DetailRowsSkeleton() {
  return (
    <RowStack>
      {Array.from({ length: PLACEHOLDER_LIST_ROWS }, (_, i) => (
        <DetailRowSkeleton key={i} />
      ))}
    </RowStack>
  );
}

export function MessageRowsSkeleton() {
  return (
    <RowStack>
      {Array.from({ length: PLACEHOLDER_LIST_ROWS }, (_, i) => (
        <MessageRowSkeleton key={i} />
      ))}
    </RowStack>
  );
}

export function AnnouncementRowsSkeleton() {
  return (
    <RowStack>
      {Array.from({ length: PLACEHOLDER_LIST_ROWS }, (_, i) => (
        <AnnouncementRowSkeleton key={i} />
      ))}
    </RowStack>
  );
}

function QuietButton({
  children,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline";
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      tabIndex={-1}
      className={cn("pointer-events-none", className)}
    >
      {children}
    </Button>
  );
}

const QUICK_LINK_CLASS =
  "flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-transparent dark:text-slate-100";

export function QuickLinksSkeleton() {
  return (
    <Card className="p-4" aria-hidden="true">
      <p className={CARD_LABEL}>Accès rapide</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {PARENT_QUICK_LINKS.map(({ to, label, icon: Icon }) => (
          <div key={to} className={QUICK_LINK_CLASS}>
            <Icon className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <span className="min-w-0 leading-tight">{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ParentHomeSkeletonBody() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-2 md:mx-0 md:grid md:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] md:overflow-visible md:px-0"
      >
        {Array.from({ length: PLACEHOLDER_CHILDREN }, (_, i) => (
          <ChildChipSkeleton key={i} selected={i === 0} />
        ))}
      </div>

      <div className="space-y-4">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="block h-full">
            <Card className="h-full p-4">
              <AverageCardBodySkeleton />
            </Card>
          </div>
          <div className="block h-full">
            <Card className="h-full p-4">
              <PresenceCardBodySkeleton />
            </Card>
          </div>
          <Card className="col-span-2 p-4 lg:col-span-1">
            <div className="flex items-start justify-between gap-2">
              <p className={CARD_LABEL}>Assiduité · 4 dernières semaines</p>
              <span className="shrink-0 text-xs font-semibold text-brand-700">Détails</span>
            </div>
            <StripBodySkeleton />
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Panel
            icon={ClipboardList}
            title="Devoirs de la semaine"
            subtitle="Exercices et devoirs des 7 prochains jours"
            action={
              <QuietButton variant="secondary" className="min-h-11 w-full">
                Tous les exercices
              </QuietButton>
            }
          >
            <DetailRowsSkeleton />
          </Panel>
          <Panel
            icon={BookOpen}
            title="Dernières notes"
            subtitle="Publiées pour l’enfant"
            action={
              <QuietButton variant="secondary" className="min-h-11 w-full">
                Toutes les notes
              </QuietButton>
            }
          >
            <DetailRowsSkeleton />
          </Panel>
          <Panel
            icon={MessageSquare}
            title="Messages"
            subtitle="École et enseignants"
            action={
              <QuietButton variant="secondary" className="min-h-11 w-full">
                <MessageSquare className="h-4 w-4" />
                Voir tous les messages
              </QuietButton>
            }
          >
            <MessageRowsSkeleton />
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel
              icon={Bell}
              title="Annonces de l’école"
              subtitle="Infos officielles de l’administration"
              action={
                <QuietButton variant="secondary" className="min-h-11 w-full">
                  <Bell className="h-4 w-4" />
                  Voir les annonces
                </QuietButton>
              }
            >
              <AnnouncementRowsSkeleton />
            </Panel>
          </div>
          <QuickLinksSkeleton />
        </section>
      </div>
    </div>
  );
}

/** Full parent-home placeholder: real header when the profile is already known. */
export function ParentHomeSkeleton() {
  const { profile, schools, schoolId } = useAuth();
  const name = personName(profile?.first_name, profile?.last_name);
  const schoolName = schools.find((s) => s.id === schoolId)?.name;

  return (
    <div className="parent-home-skeleton space-y-4">
      <ParentHomeHeader name={name} schoolName={schoolName} />
      <div aria-busy="true" aria-live="polite">
        <p className="sr-only">Chargement de l’accueil…</p>
        <ParentHomeSkeletonBody />
      </div>
    </div>
  );
}
