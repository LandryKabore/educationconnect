import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, startOfDay, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar,
  Copy,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  MailX,
  Receipt,
  ScrollText,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { copyToClipboard } from "@/lib/clipboard";
import { supabase } from "@/lib/supabase";
import type { AuditLogRow } from "@/lib/types";
import { ROLE_LABELS, type AppRole } from "@/lib/types";
import { cn, personName } from "@/lib/utils";

const PAGE_SIZE = 200;

type AuditCategory = "acces" | "comptes" | "invitations";
type CategoryFilter = "all" | AuditCategory;
type DateRange = "all" | "today" | "7" | "30" | "90";

type ActionMeta = {
  label: string;
  category: AuditCategory | null;
  icon: LucideIcon;
  iconClass: string;
};

type NameRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type InviteRow = NameRow & { email: string | null };

type EnrichedLog = AuditLogRow & {
  details: Record<string, unknown>;
};

type AuditBundle = {
  logs: EnrichedLog[];
  profiles: Map<string, NameRow>;
  roles: Map<string, string[]>;
  schools: Map<string, string>;
  invites: Map<string, InviteRow>;
};

const ACTIONS: Record<string, ActionMeta> = {
  reset_password: {
    label: "Mot de passe réinitialisé",
    category: "acces",
    icon: KeyRound,
    iconClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  force_password_change: {
    label: "Changement de mot de passe exigé",
    category: "acces",
    icon: KeyRound,
    iconClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  lock_user: {
    label: "Compte verrouillé",
    category: "acces",
    icon: Lock,
    iconClass:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  },
  unlock_user: {
    label: "Compte déverrouillé",
    category: "acces",
    icon: LockOpen,
    iconClass:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  recovery_link: {
    label: "Lien de récupération généré",
    category: "acces",
    icon: Link2,
    iconClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  create_user: {
    label: "Compte créé",
    category: "comptes",
    icon: UserPlus,
    iconClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  give_student_account: {
    label: "Compte élève activé",
    category: "comptes",
    icon: UserPlus,
    iconClass:
      "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  },
  make_student_family_managed: {
    label: "Compte passé en gestion famille",
    category: "comptes",
    icon: Users,
    iconClass:
      "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  },
  cancel_invite: {
    label: "Invitation annulée",
    category: "invitations",
    icon: MailX,
    iconClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
  update_billing: {
    label: "Facturation mise à jour",
    category: "comptes",
    icon: Receipt,
    iconClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
  update_settings: {
    label: "Paramètres de la plateforme mis à jour",
    category: "comptes",
    icon: Settings,
    iconClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  },
};

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "acces", label: "Accès" },
  { key: "comptes", label: "Comptes" },
  { key: "invitations", label: "Invitations" },
];

const DETAIL_LABELS: Record<string, string> = {
  role: "Rôle",
  school_id: "École",
  via: "Méthode",
  family_managed: "Compte famille",
  restored_roles: "Rôles restaurés",
  method: "Méthode",
  email: "E-mail",
  reason: "Motif",
  username: "Identifiant",
};

const VIA_LABELS: Record<string, string> = {
  "gerer-identifiant": "Gestion des identifiants",
  "importer-eleves": "Import",
  "support-user-action": "Action support",
  "creer-utilisateur": "Création de compte",
};

const ROLE_SHORT: Record<string, string> = {
  super_admin: "super admin",
  school_admin: "administrateur",
  teacher: "enseignant",
  student: "élève",
  parent: "parent",
};

const DETAIL_ORDER = [
  "via",
  "role",
  "school_id",
  "family_managed",
  "restored_roles",
  "email",
  "username",
  "reason",
  "method",
];

function metaFor(action: string): ActionMeta {
  const known = ACTIONS[action];
  if (known) return known;
  return {
    label: humanize(action),
    category: null,
    icon: ScrollText,
    iconClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
  };
}

function humanize(code: string): string {
  const text = code.replace(/[_-]+/g, " ").trim();
  if (!text) return "Action";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function asDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function rolePhrase(role: string): string {
  if (role in ROLE_LABELS) return ROLE_SHORT[role] ?? ROLE_LABELS[role as AppRole];
  return humanize(role).toLowerCase();
}

function detailLabel(key: string): string {
  return DETAIL_LABELS[key] ?? humanize(key);
}

function formatDetailValue(
  key: string,
  value: unknown,
  schools: Map<string, string>,
): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (key === "role" && typeof value === "string") return rolePhrase(value);
  if (key === "via" && typeof value === "string") {
    return VIA_LABELS[value] ?? value;
  }
  if (key === "school_id" && typeof value === "string") {
    return schools.get(value) ?? shortId(value);
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function actorLine(actor: NameRow | null, via: unknown): string {
  let name = "Système";
  if (actor) {
    const initial = actor.first_name?.trim().charAt(0);
    const last = actor.last_name?.trim();
    if (initial && last) name = `${initial.toLocaleUpperCase("fr")}. ${last}`;
    else name = personName(actor.first_name, actor.last_name) || shortId(actor.id);
  }
  if (via === "importer-eleves") name += " (import)";
  return name;
}

function targetOf(
  log: EnrichedLog,
  bundle: AuditBundle,
): { name: string; role: string | null } | null {
  if (log.entity_type === "user" && log.entity_id) {
    const profile = bundle.profiles.get(log.entity_id);
    const fromDetails =
      typeof log.details.role === "string" ? log.details.role : null;
    const roles = bundle.roles.get(log.entity_id) ?? [];
    const role = fromDetails ?? roles[0] ?? null;
    if (!profile && !role) return null;
    return {
      name: profile
        ? personName(profile.first_name, profile.last_name) || shortId(log.entity_id)
        : shortId(log.entity_id),
      role: role ? rolePhrase(role) : null,
    };
  }
  if (log.entity_type === "invitation" && log.entity_id) {
    const invite = bundle.invites.get(log.entity_id);
    if (!invite) return null;
    const name =
      personName(invite.first_name, invite.last_name) || invite.email || null;
    if (!name) return null;
    return { name, role: null };
  }
  if (log.entity_type === "school" && log.entity_id) {
    const school = bundle.schools.get(log.entity_id);
    if (!school) return null;
    return { name: school, role: null };
  }
  const schoolId = log.details.school_id;
  if (typeof schoolId === "string" && bundle.schools.get(schoolId) && !log.entity_id) {
    return { name: bundle.schools.get(schoolId)!, role: null };
  }
  return null;
}

function titleFor(log: EnrichedLog, bundle: AuditBundle): string {
  const meta = metaFor(log.action);
  const target = targetOf(log, bundle);
  if (!target) return meta.label;
  const role = target.role ? ` (${target.role})` : "";
  return `${meta.label} pour ${target.name}${role}`;
}

function dayHeading(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return "Aujourd’hui";
  if (isYesterday(date)) return "Hier";
  const label = format(date, "EEEE d MMM yyyy", { locale: fr });
  return label.charAt(0).toLocaleUpperCase("fr") + label.slice(1);
}

function inDateRange(iso: string, range: DateRange, now: Date): boolean {
  if (range === "all") return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  if (range === "today") return isToday(date);
  const days = Number(range);
  return date >= startOfDay(subDays(now, days - 1));
}

async function fetchInChunks<T>(
  table: "profils" | "roles_utilisateurs" | "ecoles" | "invitations",
  column: string,
  ids: string[],
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 80) {
    const slice = unique.slice(i, i + 80);
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(column, slice);
    if (error || !data) continue;
    out.push(...(data as T[]));
  }
  return out;
}

function windowLabel(count: number, limit: number): string {
  if (count >= limit) return `${limit} dernières actions`;
  if (count <= 1) return `${count} action`;
  return `${count} actions`;
}

const EMPTY_BUNDLE: AuditBundle = {
  logs: [],
  profiles: new Map(),
  roles: new Map(),
  schools: new Map(),
  invites: new Map(),
};

export default function AdminAudit() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [range, setRange] = useState<DateRange>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-audit-logs", limit],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AuditBundle> => {
      const { data: rows, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      const logs = ((rows ?? []) as AuditLogRow[]).map((row) => ({
        ...row,
        details: asDetails(row.details),
      }));

      const profileIds: string[] = [];
      const inviteIds: string[] = [];
      const schoolIds: string[] = [];
      for (const log of logs) {
        if (log.actor_id) profileIds.push(log.actor_id);
        if (log.entity_type === "user" && log.entity_id) profileIds.push(log.entity_id);
        if (log.entity_type === "invitation" && log.entity_id) {
          inviteIds.push(log.entity_id);
        }
        if (log.entity_type === "school" && log.entity_id) schoolIds.push(log.entity_id);
        const schoolId = log.details.school_id;
        if (typeof schoolId === "string") schoolIds.push(schoolId);
      }

      const [profiles, roleRows, schools, invites] = await Promise.all([
        fetchInChunks<NameRow>(
          "profils",
          "id",
          profileIds,
          "id, first_name, last_name",
        ),
        fetchInChunks<{ user_id: string; role: string; active: boolean | null }>(
          "roles_utilisateurs",
          "user_id",
          profileIds,
          "user_id, role, active",
        ),
        fetchInChunks<{ id: string; name: string }>("ecoles", "id", schoolIds, "id, name"),
        fetchInChunks<InviteRow>(
          "invitations",
          "id",
          inviteIds,
          "id, email, first_name, last_name",
        ),
      ]);

      const roles = new Map<string, string[]>();
      for (const row of roleRows) {
        if (row.active === false) continue;
        const list = roles.get(row.user_id) ?? [];
        if (!list.includes(row.role)) list.push(row.role);
        roles.set(row.user_id, list);
      }

      return {
        logs,
        profiles: new Map(profiles.map((p) => [p.id, p])),
        roles,
        schools: new Map(schools.map((s) => [s.id, s.name])),
        invites: new Map(invites.map((i) => [i.id, i])),
      };
    },
  });

  const bundle = data ?? EMPTY_BUNDLE;
  const hasMore = bundle.logs.length >= limit;

  const prepared = useMemo(() => {
    const now = new Date();
    const q = fold(search.trim());
    const dated = bundle.logs.filter((log) => inDateRange(log.created_at, range, now));
    const matched = q
      ? dated.filter((log) => fold(haystack(log, bundle)).includes(q))
      : dated;
    const counts: Record<AuditCategory, number> = {
      acces: 0,
      comptes: 0,
      invitations: 0,
    };
    for (const log of matched) {
      const cat = metaFor(log.action).category;
      if (cat) counts[cat] += 1;
    }
    const visible =
      category === "all"
        ? matched
        : matched.filter((log) => metaFor(log.action).category === category);

    const groups: { key: string; label: string; items: EnrichedLog[] }[] = [];
    for (const log of visible) {
      const key = format(new Date(log.created_at), "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(log);
      else groups.push({ key, label: dayHeading(log.created_at), items: [log] });
    }
    return { visible, counts, groups };
  }, [bundle, search, category, range]);

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setRange("all");
  };

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyId = async (id: string) => {
    const ok = await copyToClipboard(id);
    if (ok) toast.success("Identifiant copié");
    else toast.error("Copie impossible");
  };

  const loadMore = () => setLimit((n) => n + PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Journal d’audit" />
      <p className="mb-4 -mt-4 text-sm text-slate-600 dark:text-slate-300">
        {isLoading ? (
          "Chargement…"
        ) : (
          <>
            {windowLabel(bundle.logs.length, limit)}
            {hasMore ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="font-medium text-brand-700 hover:underline disabled:opacity-60 dark:text-brand-300"
                  onClick={loadMore}
                  disabled={isFetching}
                >
                  Charger plus
                </button>
              </>
            ) : null}
          </>
        )}
      </p>

      <div className="mb-4 space-y-3">
        <Input
          placeholder="Filtrer par action, nom ou identifiant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Filtrer le journal"
        />
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((item) => {
            const selected = category === item.key;
            const count =
              item.key === "all" ? null : prepared.counts[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategory(item.key)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  selected
                    ? "border-brand-600 bg-brand-700 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-slate-600 dark:bg-[var(--surface-2)] dark:text-slate-200",
                )}
              >
                {item.label}
                {count != null ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                      selected ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
          <label
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border bg-white px-3 text-sm font-medium text-slate-800 dark:bg-[var(--surface-2)] dark:text-slate-100",
              range !== "all"
                ? "border-brand-600 ring-2 ring-brand-100 dark:ring-brand-900"
                : "border-slate-200 dark:border-slate-600",
            )}
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            <select
              aria-label="Période"
              value={range}
              onChange={(e) => setRange(e.target.value as DateRange)}
              className="bg-transparent text-sm font-medium outline-none"
            >
              <option value="all">Toutes les dates</option>
              <option value="today">Aujourd’hui</option>
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">90 derniers jours</option>
            </select>
          </label>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Chargement du journal…
            </p>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : bundle.logs.length === 0 ? (
          <EmptyState message="Aucune entrée dans le journal." />
        ) : prepared.visible.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {search.trim()
                ? `Aucune action ne correspond à « ${search.trim()} ».`
                : "Aucune action ne correspond à ce filtre."}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex h-9 items-center rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-[var(--surface-2)]"
            >
              Effacer le filtre
            </button>
            {hasMore ? (
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                Des actions plus anciennes ne sont pas encore chargées.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            {prepared.groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  {group.label}
                </h2>
                <ul className="divide-y divide-slate-100 dark:divide-[var(--border)]">
                  {group.items.map((log) => (
                    <AuditRow
                      key={log.id}
                      log={log}
                      bundle={bundle}
                      open={openIds.has(log.id)}
                      onToggle={() => toggle(log.id)}
                      onCopy={(id) => void copyId(id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {!isLoading && hasMore && bundle.logs.length > 0 ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={isFetching}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-[var(--surface-2)]"
          >
            {isFetching ? "Chargement…" : `Charger ${PAGE_SIZE} de plus`}
          </button>
        ) : null}
      </Card>
    </div>
  );
}

function haystack(log: EnrichedLog, bundle: AuditBundle): string {
  const meta = metaFor(log.action);
  const actor = log.actor_id ? bundle.profiles.get(log.actor_id) ?? null : null;
  const target = targetOf(log, bundle);
  const detailText = Object.entries(log.details)
    .map(([key, value]) => `${detailLabel(key)} ${formatDetailValue(key, value, bundle.schools)}`)
    .join(" ");
  return [
    log.action,
    meta.label,
    log.entity_type ?? "",
    log.entity_id ?? "",
    actorLine(actor, log.details.via),
    actor ? personName(actor.first_name, actor.last_name) : "",
    target?.name ?? "",
    target?.role ?? "",
    detailText,
  ].join(" ");
}

function AuditRow({
  log,
  bundle,
  open,
  onToggle,
  onCopy,
}: {
  log: EnrichedLog;
  bundle: AuditBundle;
  open: boolean;
  onToggle: () => void;
  onCopy: (id: string) => void;
}) {
  const meta = metaFor(log.action);
  const Icon = meta.icon;
  const actor = log.actor_id ? bundle.profiles.get(log.actor_id) ?? null : null;
  const panelId = `audit-details-${log.id}`;
  const entries = orderedDetails(log.details);

  return (
    <li className="py-3">
      <div className="flex gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            meta.iconClass,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {titleFor(log, bundle)}
          </p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            par {actorLine(actor, log.details.via)}
            {" · "}
            <time dateTime={log.created_at}>
              {format(new Date(log.created_at), "HH:mm")}
            </time>
            {" · "}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={onToggle}
              className="font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
            >
              {open ? "Masquer" : "Détails"}
            </button>
          </p>
          {open ? (
            <div
              id={panelId}
              className="mt-2 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 dark:bg-[var(--surface-2)]"
            >
              {entries.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Aucun détail enregistré.
                </p>
              ) : (
                entries.map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {detailLabel(key)}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-slate-900 dark:text-slate-100">
                      {formatDetailValue(key, value, bundle.schools)}
                    </p>
                  </div>
                ))
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Code
                </p>
                <p className="mt-0.5 font-mono text-sm text-slate-800 dark:text-slate-100">
                  {log.action}
                </p>
              </div>
              {log.entity_id ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    ID
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-slate-800 dark:text-slate-100" title={log.entity_id}>
                      {shortId(log.entity_id)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopy(log.entity_id!)}
                      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copier
                    </button>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function orderedDetails(details: Record<string, unknown>): [string, unknown][] {
  const keys = Object.keys(details);
  keys.sort((a, b) => {
    const ia = DETAIL_ORDER.indexOf(a);
    const ib = DETAIL_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "fr");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((key) => [key, details[key]]);
}
