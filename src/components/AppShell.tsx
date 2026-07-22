import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookMarked,
  BookOpen,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  PencilLine,
  School,
  Settings,
  User,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentsWithoutClassCount } from "@/hooks/useStudentsWithoutClassCount";
import { useUnreadMessagesCount, useMessagesHomeRealtime, EMPTY_UNREAD_INBOX } from "@/hooks/useUnreadMessagesCount";
import { usePendingExamsCount } from "@/hooks/usePendingExamsCount";
import {
  useParentExamsRealtime,
  useSchoolExamsRealtime,
  useStudentExamsRealtime,
  useTeacherExamsRealtime,
} from "@/hooks/useExamRealtime";
import {
  useNotesPendingChanges,
  useParentNotesRealtime,
  useStudentNotesRealtime,
} from "@/hooks/useNotesRealtime";
import {
  useParentPresenceRealtime,
  usePresencePendingChanges,
  useSchoolPresenceRealtime,
  useStudentPresenceRealtime,
} from "@/hooks/usePresenceRealtime";
import { useStudentTimetableRealtime, useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { BrandLogo } from "@/components/BrandLogo";
import { LiveClockWeather } from "@/components/LiveClockWeather";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui";
import { cn, personName } from "@/lib/utils";
import type { AppRole } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { isDesktopApp } from "@/lib/platform";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?:
    | "eleves-sans-classe"
    | "messages-unread"
    | "annonces-unread"
    | "edt-updates"
    | "examens-en-attente"
    | "notes-updates"
    | "presence-updates"
    | "enfants-attention";
}

interface NavGroup {
  /** Section label in the sidebar — omit for a single untitled block. */
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS_BY_ROLE: Record<AppRole, NavGroup[]> = {
  super_admin: [
    {
      items: [
        { to: "/admin", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
        { to: "/admin/ecoles", label: "Écoles", icon: <School className="h-4 w-4" /> },
        { to: "/admin/utilisateurs", label: "Utilisateurs", icon: <Users className="h-4 w-4" /> },
        { to: "/admin/invitations", label: "Invitations", icon: <MessageSquare className="h-4 w-4" /> },
        { to: "/admin/rapports", label: "Rapports", icon: <ClipboardList className="h-4 w-4" /> },
        { to: "/admin/abonnements", label: "Abonnements", icon: <BookOpen className="h-4 w-4" /> },
        { to: "/admin/parametres", label: "Paramètres", icon: <Settings className="h-4 w-4" /> },
        { to: "/admin/audit", label: "Journal d'audit", icon: <ClipboardList className="h-4 w-4" /> },
        { to: "/admin/super-admins", label: "Super admins", icon: <UserCog className="h-4 w-4" /> },
      ],
    },
  ],
  school_admin: [
    {
      items: [
        { to: "/ecole", label: "Mon école", icon: <School className="h-4 w-4" /> },
        {
          to: "/ecole/configuration",
          label: "Configuration",
          icon: <ListChecks className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Vie scolaire",
      items: [
        {
          to: "/emplois-du-temps",
          label: "Emplois du temps",
          icon: <CalendarDays className="h-4 w-4" />,
        },
        {
          to: "/presences-ecole",
          label: "Présences",
          icon: <CheckCircle2 className="h-4 w-4" />,
        },
        {
          to: "/devoirs-ecole",
          label: "Devoirs",
          icon: <FileText className="h-4 w-4" />,
          badgeKey: "examens-en-attente",
        },
        {
          to: "/compositions-ecole",
          label: "Compositions",
          icon: <BookMarked className="h-4 w-4" />,
        },
        {
          to: "/saisie-enseignant",
          label: "Saisie enseignant",
          icon: <PencilLine className="h-4 w-4" />,
        },
        { to: "/bulletins", label: "Bulletins", icon: <ClipboardList className="h-4 w-4" /> },
      ],
    },
    {
      label: "Personnes",
      items: [
        { to: "/enseignants", label: "Enseignants", icon: <UserCog className="h-4 w-4" /> },
        {
          to: "/eleves",
          label: "Élèves",
          icon: <GraduationCap className="h-4 w-4" />,
          badgeKey: "eleves-sans-classe",
        },
        { to: "/parents", label: "Parents", icon: <UserPlus className="h-4 w-4" /> },
      ],
    },
    {
      label: "Structure",
      items: [
        {
          to: "/ecole/parametres",
          label: "Paramètres école",
          icon: <Settings className="h-4 w-4" />,
        },
        { to: "/annees", label: "Années scolaires", icon: <CalendarRange className="h-4 w-4" /> },
        { to: "/matieres", label: "Matières", icon: <BookOpen className="h-4 w-4" /> },
        { to: "/classes", label: "Classes", icon: <Users className="h-4 w-4" /> },
        { to: "/programmes", label: "Programmes", icon: <Layers className="h-4 w-4" /> },
      ],
    },
    {
      label: "Communication",
      items: [
        {
          to: "/messages",
          label: "Messages",
          icon: <MessageSquare className="h-4 w-4" />,
          badgeKey: "messages-unread",
        },
        {
          to: "/annonces",
          label: "Annonces",
          icon: <Megaphone className="h-4 w-4" />,
          badgeKey: "annonces-unread",
        },
      ],
    },
  ],
  teacher: [
    {
      items: [
        {
          to: "/tableau-de-bord",
          label: "Tableau de bord",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Enseignement",
      items: [
        { to: "/mes-classes", label: "Classes", icon: <Users className="h-4 w-4" /> },
        { to: "/mes-eleves", label: "Élèves", icon: <GraduationCap className="h-4 w-4" /> },
        { to: "/presences", label: "Présences", icon: <CheckCircle2 className="h-4 w-4" /> },
        {
          to: "/mon-emploi-du-temps",
          label: "Mon emploi du temps",
          icon: <CalendarDays className="h-4 w-4" />,
        },
        {
          to: "/devoirs",
          label: "Devoirs & évaluations",
          icon: <ClipboardList className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Communication",
      items: [
        {
          to: "/messages",
          label: "Messages",
          icon: <MessageSquare className="h-4 w-4" />,
          badgeKey: "messages-unread",
        },
        {
          to: "/annonces",
          label: "Annonces",
          icon: <Megaphone className="h-4 w-4" />,
          badgeKey: "annonces-unread",
        },
      ],
    },
  ],
  student: [
    {
      items: [
        {
          to: "/tableau-de-bord",
          label: "Tableau de bord",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Vie scolaire",
      items: [
        {
          to: "/mes-notes",
          label: "Mes notes",
          icon: <BookOpen className="h-4 w-4" />,
          badgeKey: "notes-updates",
        },
        {
          to: "/mes-exercices",
          label: "Exercices de maison",
          icon: <ClipboardList className="h-4 w-4" />,
        },
        {
          to: "/mes-devoirs",
          label: "Devoirs",
          icon: <FileText className="h-4 w-4" />,
        },
        {
          to: "/mes-compositions",
          label: "Compositions",
          icon: <BookMarked className="h-4 w-4" />,
        },
        {
          to: "/mes-presences",
          label: "Mes présences",
          icon: <CheckCircle2 className="h-4 w-4" />,
          badgeKey: "presence-updates",
        },
        {
          to: "/mes-profs",
          label: "Mes profs",
          icon: <Users className="h-4 w-4" />,
        },
        {
          to: "/mon-emploi-du-temps",
          label: "Mon emploi du temps",
          icon: <CalendarDays className="h-4 w-4" />,
          badgeKey: "edt-updates",
        },
        {
          to: "/mon-bulletin",
          label: "Mon bulletin",
          icon: <GraduationCap className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Communication",
      items: [
        {
          to: "/messages",
          label: "Messages",
          icon: <MessageSquare className="h-4 w-4" />,
          badgeKey: "messages-unread",
        },
        {
          to: "/annonces",
          label: "Annonces",
          icon: <Megaphone className="h-4 w-4" />,
          badgeKey: "annonces-unread",
        },
      ],
    },
  ],
  parent: [
    {
      items: [
        { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
        {
          to: "/enfants",
          label: "Enfants",
          icon: <Users className="h-4 w-4" />,
          badgeKey: "enfants-attention",
        },
        {
          to: "/messages",
          label: "Messages",
          icon: <MessageSquare className="h-4 w-4" />,
          badgeKey: "messages-unread",
        },
        {
          to: "/annonces",
          label: "Annonces",
          icon: <Megaphone className="h-4 w-4" />,
          badgeKey: "annonces-unread",
        },
      ],
    },
  ],
};

const ACCOUNT_GROUP: NavGroup = {
  label: "Compte",
  items: [{ to: "/profil", label: "Profil", icon: <User className="h-4 w-4" /> }],
};

const DOWNLOAD_ITEM: NavItem = {
  to: "/telecharger",
  label: "Télécharger l'app",
  icon: <Download className="h-4 w-4" />,
};

export function AppShell() {
  const {
    profile,
    role,
    schools,
    schoolId,
    signOut,
    supportSchoolId,
    exitSupportMode,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  const roleGroups = role ? NAV_GROUPS_BY_ROLE[role] : [];
  const navGroups: NavGroup[] = [
    ...roleGroups,
    {
      ...ACCOUNT_GROUP,
      items: [
        ...ACCOUNT_GROUP.items,
        ...(isDesktopApp() ? [] : [DOWNLOAD_ITEM]),
      ],
    },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate("/connexion");
  };

  const supportSchool = schools.find((s) => s.id === supportSchoolId);
  const schoolName =
    supportSchool?.name ??
    schools.find((s) => s.id === schoolId)?.name ??
    schools[0]?.name;

  const { data: sansClasseCount = 0 } = useStudentsWithoutClassCount();
  const { data: unreadInbox = EMPTY_UNREAD_INBOX } = useUnreadMessagesCount();
  useMessagesHomeRealtime();
  const { data: pendingExamsCount = 0 } = usePendingExamsCount();
  useStudentTimetableRealtime();
  useStudentExamsRealtime();
  useTeacherExamsRealtime();
  useSchoolExamsRealtime();
  useParentExamsRealtime();
  useStudentNotesRealtime();
  useParentNotesRealtime();
  useStudentPresenceRealtime();
  useParentPresenceRealtime();
  useSchoolPresenceRealtime();
  const { pendingCount: edtUpdatesCount = 0 } = useEdtPendingChanges();
  const { pendingCount: notesUpdatesCount = 0 } = useNotesPendingChanges();
  const { pendingCount: presenceUpdatesCount = 0 } =
    usePresencePendingChanges();
  const enfantsAttentionCount = notesUpdatesCount + presenceUpdatesCount;

  const badgeFor = (item: NavItem): { count: number; title: string; tone: "amber" | "rose" | "brand" } | null => {
    if (item.badgeKey === "eleves-sans-classe" && sansClasseCount > 0) {
      return {
        count: sansClasseCount,
        title: `${sansClasseCount} élève(s) sans classe`,
        tone: "amber",
      };
    }
    if (item.badgeKey === "messages-unread" && unreadInbox.discussions > 0) {
      return {
        count: unreadInbox.discussions,
        title: `${unreadInbox.discussions} message(s) non lu(s)`,
        tone: "rose",
      };
    }
    if (item.badgeKey === "annonces-unread" && unreadInbox.announcements > 0) {
      return {
        count: unreadInbox.announcements,
        title: `${unreadInbox.announcements} annonce(s) non lue(s)`,
        tone: "amber",
      };
    }
    if (item.badgeKey === "edt-updates" && edtUpdatesCount > 0) {
      return {
        count: edtUpdatesCount,
        title: `${edtUpdatesCount} modification(s) de l’emploi du temps`,
        tone: "brand",
      };
    }
    if (item.badgeKey === "examens-en-attente" && pendingExamsCount > 0) {
      return {
        count: pendingExamsCount,
        title: `${pendingExamsCount} devoir(s) à confirmer`,
        tone: "amber",
      };
    }
    if (item.badgeKey === "notes-updates" && notesUpdatesCount > 0) {
      return {
        count: notesUpdatesCount,
        title: `${notesUpdatesCount} nouvelle(s) note(s)`,
        tone: "brand",
      };
    }
    if (item.badgeKey === "presence-updates" && presenceUpdatesCount > 0) {
      return {
        count: presenceUpdatesCount,
        title: `${presenceUpdatesCount} absence(s) / retard(s)`,
        tone: "amber",
      };
    }
    if (item.badgeKey === "enfants-attention" && enfantsAttentionCount > 0) {
      return {
        count: enfantsAttentionCount,
        title: `${enfantsAttentionCount} alerte(s) notes / présences`,
        tone: "amber",
      };
    }
    return null;
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[var(--bg)]">
      {supportSchoolId ? (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
          <span>
            Mode support — vous consultez l’école comme administrateur
            {supportSchool?.name ? ` (${supportSchool.name})` : ""}.
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              exitSupportMode();
              navigate("/admin");
            }}
          >
            Quitter le mode support
          </Button>
        </div>
      ) : null}

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 dark:border-[var(--border)] dark:bg-[var(--surface)]",
          supportSchoolId ? "top-12" : "",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-[var(--border)]">
          <div className="min-w-0 flex-1">
            <BrandLogo
              className="h-14 w-auto max-w-[11rem] rounded-lg"
              imgClassName="h-14"
            />
            {schoolName ? (
              <p className="mt-1 truncate text-xs text-slate-500">{schoolName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-slate-200 px-3 py-3 dark:border-[var(--border)]">
          <LiveClockWeather />
          <ThemeToggle className="w-full justify-center" />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-4">
            {navGroups.map((group, groupIndex) => (
              <div key={group.label ?? `group-${groupIndex}`} className="space-y-0.5">
                {group.label ? (
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((item) => {
                  const active =
                    location.pathname === item.to ||
                    (item.to !== "/tableau-de-bord" &&
                      item.to !== "/ecole" &&
                      item.to !== "/admin" &&
                      location.pathname.startsWith(item.to));
                  const badge = badgeFor(item);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          active ? "text-brand-700 dark:text-brand-300" : "text-slate-400",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge != null ? (
                        <span
                          className={cn(
                            "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-white",
                            badge.tone === "rose" && "bg-rose-500",
                            badge.tone === "amber" && "bg-amber-500",
                            badge.tone === "brand" && "bg-brand-600",
                          )}
                          title={badge.title}
                        >
                          {badge.count > 99 ? "99+" : badge.count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <div className="mb-3">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {personName(profile?.first_name, profile?.last_name) || (
                <span className="inline-block h-4 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              )}
            </p>
            {role ? (
              <p className="text-xs text-slate-500">{ROLE_LABELS[role]}</p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </aside>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col lg:ml-72",
          supportSchoolId ? "pt-12" : "",
        )}
      >
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-[var(--border)] dark:bg-[var(--surface)] lg:hidden">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo className="h-9 w-auto max-w-[9rem] flex-1 rounded-md" />
          <ThemeToggle compact />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <ErrorBoundary
            scope="page"
            compact
            resetKeys={[location.pathname, location.search]}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
