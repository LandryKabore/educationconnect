import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookMarked,
  BarChart3,
  BookOpen,
  BookOpenCheck,
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
  Lock,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  PencilLine,
  School,
  Search,
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
import { useParentChildren } from "@/hooks/useParentHome";
import { writeSelectedChild } from "@/lib/parentHome";
import { Modal } from "@/components/Modal";
import {
  useExercicesPendingChanges,
  useParentExamsRealtime,
  useSchoolExamsRealtime,
  useStudentExamsRealtime,
  useTeacherExamsRealtime,
} from "@/hooks/useExamRealtime";
import {
  useCompositionsPendingChanges,
  useParentCompositionsRealtime,
  useStudentCompositionsRealtime,
} from "@/hooks/useCompositionRealtime";
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
import {
  useEdtPendingChanges,
  useParentTimetableRealtime,
  useStudentTimetableRealtime,
} from "@/hooks/useStudentTimetableUpdates";
import { BrandLogo } from "@/components/BrandLogo";
import { LiveClockWeather } from "@/components/LiveClockWeather";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HelpLauncher } from "@/components/HelpLauncher";
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
  /** Parent "Mes enfants" page: asks which child, then opens /enfants/:id/<childPage>. */
  childPage?: string;
  badgeKey?:
    | "eleves-sans-classe"
    | "messages-unread"
    | "annonces-unread"
    | "edt-updates"
    | "examens-en-attente"
    | "notes-updates"
    | "presence-updates"
    | "exercices-updates"
    | "compositions-updates"
    | "enfants-attention";
  /** Only highlight on an exact path match. */
  exact?: boolean;
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
        { to: "/signalements", label: "Signalements", icon: <MessageSquare className="h-4 w-4" /> },
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
        { to: "/cahier-ecole", label: "Cahier de textes", icon: <BookOpenCheck className="h-4 w-4" /> },
        { to: "/statistiques", label: "Statistiques", icon: <BarChart3 className="h-4 w-4" /> },
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
        { to: "/periodes", label: "Périodes et clôture", icon: <Lock className="h-4 w-4" /> },
        { to: "/signalements", label: "Signalements", icon: <MessageSquare className="h-4 w-4" /> },
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
          to: "/cahier-de-textes",
          label: "Cahier de textes",
          icon: <BookOpenCheck className="h-4 w-4" />,
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
          label: "Accueil",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Travail",
      items: [
        {
          to: "/mon-cahier",
          label: "Cahier de textes",
          icon: <BookOpenCheck className="h-4 w-4" />,
        },
        {
          to: "/mes-exercices",
          label: "Exercices de maison",
          icon: <ClipboardList className="h-4 w-4" />,
          badgeKey: "exercices-updates",
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
          badgeKey: "compositions-updates",
        },
      ],
    },
    {
      label: "Résultats",
      items: [
        {
          to: "/mes-notes",
          label: "Mes notes",
          icon: <BookOpen className="h-4 w-4" />,
          badgeKey: "notes-updates",
        },
        {
          to: "/mon-bulletin",
          label: "Mon bulletin",
          icon: <GraduationCap className="h-4 w-4" />,
        },
        {
          to: "/mes-presences",
          label: "Mes présences",
          icon: <CheckCircle2 className="h-4 w-4" />,
          badgeKey: "presence-updates",
        },
      ],
    },
    {
      label: "Ma classe",
      items: [
        {
          to: "/mon-emploi-du-temps",
          label: "Mon emploi du temps",
          icon: <CalendarDays className="h-4 w-4" />,
          badgeKey: "edt-updates",
        },
        {
          to: "/mes-profs",
          label: "Mes profs",
          icon: <Users className="h-4 w-4" />,
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
  // Parent sidebar is built per selected child — see buildParentGroups().
  parent: [],
};

/** Parent sidebar (Designer layout): Accueil / Mes enfants / Communication. */
function buildParentGroups(): NavGroup[] {
  const all: NavItem = { to: "/enfants", label: "Tous mes enfants", icon: <Users className="h-4 w-4" />, badgeKey: "enfants-attention", exact: true };
  return [
    {
      items: [
        { to: "/tableau-de-bord", label: "Accueil", icon: <LayoutDashboard className="h-4 w-4" /> },
      ],
    },
    {
      label: "Mes enfants",
      items: [
        all,
        { to: `/enfants/:child/notes`, childPage: "notes", label: "Notes", icon: <GraduationCap className="h-4 w-4" />, badgeKey: "notes-updates" },
        { to: `/enfants/:child/presences`, childPage: "presences", label: "Présences", icon: <CheckCircle2 className="h-4 w-4" />, badgeKey: "presence-updates" },
        { to: `/enfants/:child/devoirs`, childPage: "devoirs", label: "Devoirs", icon: <FileText className="h-4 w-4" /> },
        { to: `/enfants/:child/bulletin`, childPage: "bulletin", label: "Bulletins", icon: <ClipboardList className="h-4 w-4" /> },
        { to: `/enfants/:child/emploi-du-temps`, childPage: "emploi-du-temps", label: "Emploi du temps", icon: <CalendarDays className="h-4 w-4" />, badgeKey: "edt-updates" },
      ],
    },
    {
      label: "Communication",
      items: [
        { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" />, badgeKey: "messages-unread" },
        { to: "/annonces", label: "Annonces", icon: <Megaphone className="h-4 w-4" />, badgeKey: "annonces-unread" },
      ],
    },
  ];
}

const ACCOUNT_GROUP: NavGroup = {
  label: "Compte",
  items: [{ to: "/profil", label: "Profil", icon: <User className="h-4 w-4" /> }],
};

const DOWNLOAD_ITEM: NavItem = {
  to: "/telecharger",
  label: "Télécharger l'app",
  icon: <Download className="h-4 w-4" />,
};

// loaded the first time the admin opens the search (keeps the main bundle small)
const GlobalSearch = lazy(() =>
  import("@/components/GlobalSearch").then((m) => ({ default: m.GlobalSearch })),
);

export function AppShell() {
  const {
    user,
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
  const [pageOpening, setPageOpening] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const canSearch = role === "school_admin" && !!schoolId;

  // Ctrl/Cmd + K opens the school search
  useEffect(() => {
    if (!canSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSearch]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (role !== "school_admin" && role !== "super_admin") return;

    setPageOpening(true);
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => setPageOpening(false), 450);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [location.pathname, location.search, role]);

  // ---- parent: selected child (shared with the home page picker, kept in localStorage)
  const isParent = role === "parent";
  const { data: parentChildren } = useParentChildren(isParent ? user?.id : undefined);
  // Opening a child's page keeps the home page picker in sync (it reads localStorage).
  const routeChildId = /^\/enfants\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
  useEffect(() => {
    if (!isParent || !routeChildId || !parentChildren) return;
    if (parentChildren.some((c) => c.id === routeChildId)) writeSelectedChild(routeChildId);
  }, [isParent, routeChildId, parentChildren]);
  // "Notes — quel enfant ?" dialog (skipped when the parent has a single child).
  const [childAsk, setChildAsk] = useState<NavItem | null>(null);
  const openChildPage = (item: NavItem) => {
    const kids = parentChildren ?? [];
    setOpen(false);
    if (kids.length === 1) {
      navigate(`/enfants/${kids[0].id}/${item.childPage}`);
    } else if (kids.length > 1) {
      setChildAsk(item);
    } else {
      navigate("/enfants");
    }
  };

  const roleGroups = role
    ? isParent
      ? buildParentGroups()
      : NAV_GROUPS_BY_ROLE[role]
    : [];
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
  useParentTimetableRealtime();
  useStudentExamsRealtime();
  useTeacherExamsRealtime();
  useSchoolExamsRealtime();
  useParentExamsRealtime();
  useStudentCompositionsRealtime();
  useParentCompositionsRealtime();
  useStudentNotesRealtime();
  useParentNotesRealtime();
  useStudentPresenceRealtime();
  useParentPresenceRealtime();
  useSchoolPresenceRealtime();
  const { pendingCount: edtUpdatesCount = 0 } = useEdtPendingChanges();
  const { pendingCount: notesUpdatesCount = 0 } = useNotesPendingChanges();
  const { pendingCount: presenceUpdatesCount = 0 } =
    usePresencePendingChanges();
  const { pendingCount: exercicesUpdatesCount = 0 } =
    useExercicesPendingChanges();
  const { pendingCount: compositionsUpdatesCount = 0 } =
    useCompositionsPendingChanges();
  const enfantsAttentionCount =
    notesUpdatesCount +
    presenceUpdatesCount +
    edtUpdatesCount +
    exercicesUpdatesCount +
    compositionsUpdatesCount;

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
    if (item.badgeKey === "exercices-updates" && exercicesUpdatesCount > 0) {
      return {
        count: exercicesUpdatesCount,
        title: `${exercicesUpdatesCount} nouvel(eaux) exercice(s)`,
        tone: "brand",
      };
    }
    if (
      item.badgeKey === "compositions-updates" &&
      compositionsUpdatesCount > 0
    ) {
      return {
        count: compositionsUpdatesCount,
        title: `${compositionsUpdatesCount} composition(s) à consulter`,
        tone: "amber",
      };
    }
    if (item.badgeKey === "enfants-attention" && enfantsAttentionCount > 0) {
      return {
        count: enfantsAttentionCount,
        title: `${enfantsAttentionCount} alerte(s) scolaires`,
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

      {role === "student" ? (
        <StudentSidebar
          groups={[...roleGroups, ACCOUNT_GROUP]}
          showDownload={!isDesktopApp()}
          pathname={location.pathname}
          badgeFor={badgeFor}
          open={open}
          onClose={() => setOpen(false)}
          onLogout={() => void handleLogout()}
          name={personName(profile?.first_name, profile?.last_name)}
          avatarUrl={profile?.avatar_url ?? null}
          schoolName={schoolName}
          topOffset={!!supportSchoolId}
        />
      ) : (
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
            <HelpLauncher />
          </div>
  
          {canSearch ? (
            <div className="shrink-0 border-b border-slate-200 px-3 py-3 dark:border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearchOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-500 hover:border-slate-300 dark:border-[var(--border)] dark:bg-[var(--surface-2)]"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">Rechercher…</span>
                <kbd className="hidden rounded border border-slate-200 px-1.5 text-[10px] font-medium text-slate-400 lg:inline dark:border-[var(--border)]">
                  Ctrl K
                </kbd>
              </button>
            </div>
          ) : null}
  
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
                    const active = item.childPage
                      ? new RegExp(`^/enfants/[^/]+/${item.childPage}(/|$)`).test(location.pathname)
                      : location.pathname === item.to ||
                      (!item.exact &&
                        item.to !== "/tableau-de-bord" &&
                        item.to !== "/ecole" &&
                        item.to !== "/admin" &&
                        location.pathname.startsWith(item.to));
                    const badge = badgeFor(item);
                    return (
                      item.childPage ? (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => openChildPage(item)}
                        aria-haspopup={(parentChildren?.length ?? 0) > 1 ? "dialog" : undefined}
                        className={cn(
                          "flex w-full text-left items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
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
                      </button>
                      ) : (
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
                      )
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
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col lg:ml-72",
          supportSchoolId ? "pt-12" : "",
        )}
      >
        {pageOpening ? (
          <>
            <div
              className="fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-brand-100 lg:left-72"
              role="progressbar"
              aria-label="Chargement de la page"
            >
              <div className="h-full w-1/2 animate-[pulse_0.7s_ease-in-out_infinite] bg-brand-600" />
            </div>
            <div
              className="fixed right-4 top-4 z-[70] flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg dark:border-brand-800 dark:bg-[var(--surface)] dark:text-slate-100"
              role="status"
            >
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
              Chargement de la page…
            </div>
          </>
        ) : null}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-[var(--border)] dark:bg-[var(--surface)] lg:hidden">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo className="h-9 w-auto max-w-[9rem] flex-1 rounded-md" />
          {canSearch ? (
            <button
              type="button"
              className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Rechercher"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </button>
          ) : null}
          <HelpLauncher compact />
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
        {canSearch && searchOpen ? (
          <Suspense fallback={null}>
            <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
          </Suspense>
        ) : null}
      </div>
      {isParent ? (
        <Modal
          open={!!childAsk}
          title={childAsk ? `${childAsk.label} — quel enfant ?` : ""}
          onClose={() => setChildAsk(null)}
        >
          <div className="space-y-2">
            {(parentChildren ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  const page = childAsk?.childPage;
                  setChildAsk(null);
                  if (page) navigate(`/enfants/${c.id}/${page}`);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50 dark:border-[var(--border)] dark:bg-[var(--surface-2)] dark:hover:bg-brand-950/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
                  {(c.first_name?.[0] ?? "?").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {personName(c.first_name, c.last_name)}
                  </span>
                  {c.className ? (
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{c.className}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

type SidebarBadge = { count: number; title: string; tone: "amber" | "rose" | "brand" } | null;

/** Student sidebar: identity card, grouped menu with filled active item, compact footer. */
function StudentSidebar({
  groups,
  showDownload,
  pathname,
  badgeFor,
  open,
  onClose,
  onLogout,
  name,
  avatarUrl,
  schoolName,
  topOffset,
}: {
  groups: NavGroup[];
  showDownload: boolean;
  pathname: string;
  badgeFor: (item: NavItem) => SidebarBadge;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  name: string;
  avatarUrl: string | null;
  schoolName?: string;
  topOffset: boolean;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 dark:border-[var(--border)] dark:bg-[var(--surface)]",
        topOffset ? "top-12" : "",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-4">
        <BrandLogo className="h-10 w-auto max-w-[9rem] rounded-md" imgClassName="h-10" />
        <button
          type="button"
          aria-label="Fermer le menu"
          className="shrink-0 rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Identity card: same teal gradient as the page banners */}
      <Link
        to="/profil"
        onClick={onClose}
        className="relative mx-3 mt-2 block shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-md shadow-brand-900/20 transition hover:shadow-lg"
      >
        <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/[0.07]" />
        <span className="relative flex items-center gap-3 px-3.5 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/15 text-sm font-bold !text-white ring-1 ring-white/25">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold !text-white">
              {name || <span className="inline-block h-4 w-24 animate-pulse rounded bg-white/25" />}
            </span>
            <span className="block truncate text-xs !text-white/85">{schoolName ? `Élève · ${schoolName}` : "Élève"}</span>
          </span>
        </span>
        <span className="flex h-1" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </span>
      </Link>

      <div className="mx-3 mt-2.5 shrink-0">
        <LiveClockWeather />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        <div className="space-y-2.5">
          {groups.map((group, gi) => (
            <div key={group.label ?? `g-${gi}`} className="space-y-0.5">
              {group.label ? (
                <p className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                  {group.label}
                </p>
              ) : null}
              {group.items.map((item) => {
                const active =
                  pathname === item.to ||
                  (!item.exact && item.to !== "/tableau-de-bord" && pathname.startsWith(item.to));
                const badge = badgeFor(item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition",
                      active
                        ? "bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 transition",
                        active ? "text-brand-700 dark:text-brand-300" : "text-slate-400",
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {badge != null ? (
                      <span
                        title={badge.title}
                        className={cn(
                          "inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[10px] font-bold leading-none",
                          "text-white",
                          badge.tone === "rose" && "bg-rose-500",
                          badge.tone === "amber" && "bg-amber-500",
                          badge.tone === "brand" && "bg-brand-600",
                        )}
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

      <div className="flex shrink-0 items-center gap-1 border-t border-slate-200 px-3 py-2.5 dark:border-[var(--border)]">
        <HelpLauncher compact />
        <ThemeToggle compact />
        {showDownload ? (
          <Link
            to="/telecharger"
            onClick={onClose}
            aria-label="Télécharger l'app"
            title="Télécharger l'app"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-[var(--surface-2)]"
          >
            <Download className="h-5 w-5" />
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onLogout}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 dark:text-slate-300 dark:hover:bg-rose-950/40"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
