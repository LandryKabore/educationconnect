import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookMarked,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  CircleUser,
  ClipboardList,
  Download,
  FileText,
  Book,
  BookText,
  Calendar,
  GraduationCap,
  LayoutGrid,
  Layers,
  LayoutDashboard,
  ListChecks,
  FileBarChart,
  Lock,
  LogOut,
  Megaphone,
  Mail,
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
import { isDesktopApp, isNativeApp } from "@/lib/platform";
import { useQueryClient } from "@tanstack/react-query";
import { useNativeBack } from "@/lib/nativeBack";
import { useSwipeNav } from "@/hooks/useSwipeNav";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { OfflineBanner } from "@/components/OfflineBanner";

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
          label: "Tableau de bord",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
      ],
    },
    {
      label: "Vie scolaire",
      items: [
        {
          to: "/mon-cahier",
          label: "Cahier de textes",
          icon: <BookOpenCheck className="h-4 w-4" />,
        },
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

const IOS_MENU_ICON = "h-[17px] w-[17px]";

/**
 * Android app, student: same menu structure as the native iOS app
 * (Scolarité / Travaux & cahier / Communication / Compte).
 */
const IOS_ICON: Record<string, ReactNode> = {
  "/tableau-de-bord": <LayoutGrid className={IOS_MENU_ICON} />,
  "/mes-notes": <Book className={IOS_MENU_ICON} />,
  "/mon-bulletin": <FileBarChart className={IOS_MENU_ICON} />,
  "/mes-presences": <ListChecks className={IOS_MENU_ICON} />,
  "/mon-emploi-du-temps": <Calendar className={IOS_MENU_ICON} />,
  "/mes-profs": <Users className={IOS_MENU_ICON} />,
  "/mon-cahier": <Book className={IOS_MENU_ICON} />,
  "/mes-exercices": <FileText className={IOS_MENU_ICON} />,
  "/mes-devoirs": <FileText className={IOS_MENU_ICON} />,
  "/mes-compositions": <BookText className={IOS_MENU_ICON} />,
  "/messages": <Mail className={IOS_MENU_ICON} />,
  "/annonces": <Megaphone className={IOS_MENU_ICON} />,
  "/profil": <CircleUser className={IOS_MENU_ICON} />,
};

function buildNativeStudentGroups(): NavGroup[] {
  const flat = NAV_GROUPS_BY_ROLE.student.flatMap((g) => g.items);
  const pick = (...paths: string[]) =>
    paths
      .map((to) => {
        const item = flat.find((i) => i.to === to);
        return item ? { ...item, icon: IOS_ICON[to] ?? item.icon } : undefined;
      })
      .filter((i): i is NavItem => !!i);
  return [
    { items: pick("/tableau-de-bord") },
    {
      label: "Scolarité",
      items: pick("/mes-notes", "/mon-bulletin", "/mes-presences", "/mon-emploi-du-temps", "/mes-profs"),
    },
    {
      label: "Travaux & cahier",
      items: pick("/mon-cahier", "/mes-exercices", "/mes-devoirs", "/mes-compositions"),
    },
    { label: "Communication", items: pick("/messages", "/annonces") },
  ];
}

/** Title shown in the Android top bar: label of the menu entry that matches the current page. */
function titleForPath(pathname: string, groups: NavGroup[]): string {
  let best: { label: string; len: number } | null = null;
  for (const item of groups.flatMap((g) => g.items)) {
    const match = item.childPage
      ? new RegExp(`^/enfants/[^/]+/${item.childPage}(/|$)`).test(pathname)
      : pathname === item.to || (item.to.length > 1 && pathname.startsWith(`${item.to}/`));
    if (match && (!best || item.to.length > best.len)) {
      best = { label: item.label, len: item.to.length };
    }
  }
  return best?.label ?? "EduFaso";
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
  const native = isNativeApp();
  const queryClient = useQueryClient();

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
      : native && role === "student"
        ? buildNativeStudentGroups()
        : NAV_GROUPS_BY_ROLE[role]
    : [];
  const navGroups: NavGroup[] = [
    ...roleGroups,
    {
      ...ACCOUNT_GROUP,
      items: [
        ...ACCOUNT_GROUP.items,
        // no « Télécharger l'app » inside the desktop or Android app itself
        ...(isDesktopApp() || native ? [] : [DOWNLOAD_ITEM]),
      ],
    },
  ];

  const pageTitle = titleForPath(location.pathname, navGroups);
  const onDashboard = location.pathname === "/tableau-de-bord";

  // Android: back button closes the drawer first
  useNativeBack(() => setOpen(false), native && open);
  // Android: swipe right = menu, swipe left = close the menu, or profile from the home page
  useSwipeNav({
    enabled: native,
    onRight: () => {
      if (!open && !searchOpen && !childAsk) setOpen(true);
    },
    onLeft: () => {
      if (open) setOpen(false);
      else if (onDashboard && !searchOpen && !childAsk) navigate("/profil");
    },
  });
  // Android: pull down to refresh the data of the current screen
  const { indicator: pullIndicator } = usePullToRefresh(
    () => queryClient.invalidateQueries(),
    native,
  );

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
    <div className={cn("flex min-h-screen bg-slate-50 dark:bg-[var(--bg)]", native && "native-bg")}>
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
          className={cn("fixed inset-0 z-40 bg-black/40 lg:hidden", native && "native-scrim")}
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 dark:border-[var(--border)] dark:bg-[var(--surface)]",
          native && "w-[300px] border-black/[0.06]",
          native && open && "shadow-[8px_0_24px_rgba(0,0,0,0.18)]",
          supportSchoolId ? "top-12" : "",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-[var(--border)]",
            native && "items-start px-4 pb-[14px] pt-[18px]",
          )}
        >
          <div className="min-w-0 flex-1">
            {native ? (
              <BrandLogo
                file="edufaso-logo-tight.png"
                className="h-12 w-auto max-w-[160px]"
                imgClassName="h-12"
              />
            ) : (
              <BrandLogo
                className="h-14 w-auto max-w-[11rem] rounded-lg"
                imgClassName="h-14"
              />
            )}
            {schoolName ? (
              <p className={cn("mt-1 truncate text-xs text-slate-500", native && "mt-1 line-clamp-2 whitespace-normal text-[12px] text-[var(--ios-muted)]")}>{schoolName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden",
              native && "h-11 w-11 hover:bg-transparent",
            )}
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          >
            {native ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#f8fafc] dark:bg-[var(--surface-2)]">
                <X className="h-[17px] w-[17px] text-[var(--ios-ink)] dark:text-slate-100" strokeWidth={2.4} />
              </span>
            ) : (
              <X className="h-5 w-5" />
            )}
          </button>
        </div>

        {native ? null : (
          <div className="shrink-0 space-y-2 border-b border-slate-200 px-3 py-3 dark:border-[var(--border)]">
            <LiveClockWeather />
            <ThemeToggle className="w-full justify-center" />
            <HelpLauncher />
          </div>
        )}

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

        <nav className={cn("min-h-0 flex-1 overflow-y-auto p-3", native && "px-[10px] pb-4 pt-[14px]")}>
          <div className={cn("space-y-4", native && "space-y-[18px]")}>
            {navGroups.map((group, groupIndex) => (
              <div key={group.label ?? `group-${groupIndex}`} className="space-y-0.5">
                {group.label ? (
                  <p className={cn("px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500", native && "pb-0.5 text-[11px] tracking-[0.8px] text-[var(--ios-muted)]")}>
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
                        "flex min-h-11 w-full text-left items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                        native && "gap-[10px] rounded-[14px] py-3 text-[15px] font-semibold hover:bg-transparent",
                        native && (active ? "text-[var(--ios-teal-dark)]" : "text-[rgba(15,23,42,0.78)]"),
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          native ? "text-current" : active ? "text-brand-700 dark:text-brand-300" : "text-slate-400",
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
                            native && "bg-[var(--ios-red)] px-[7px] py-[3px] text-[11px]",
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
                        "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-brand-50 text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
                        native && "gap-[10px] rounded-[14px] py-3 text-[15px] font-semibold hover:bg-transparent",
                        native && (active ? "text-[var(--ios-teal-dark)]" : "text-[rgba(15,23,42,0.78)]"),
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          native ? "text-current" : active ? "text-brand-700 dark:text-brand-300" : "text-slate-400",
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
                            native && "bg-[var(--ios-red)] px-[7px] py-[3px] text-[11px]",
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
            {native ? (
              <div className="space-y-2 px-2 pt-1">
                <LiveClockWeather className="!rounded-[14px] !border-0 !bg-[#f8fafc] dark:!bg-[var(--surface-2)]" />
                <div className="flex items-center gap-2">
                  <ThemeToggle compact className="h-11 w-11 justify-center !rounded-[10px] !border-0 !bg-[#f8fafc] !p-0 dark:!bg-[var(--surface-2)]" />
                  <HelpLauncher compact className="h-11 w-11 justify-center !rounded-[10px] !border-0 !bg-[#f8fafc] !p-0 dark:!bg-[var(--surface-2)]" />
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        {native ? (
          <div className="shrink-0 border-t border-black/[0.08] bg-white pb-2 dark:border-[var(--border)] dark:bg-[var(--surface)]">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex min-h-11 w-full items-center gap-2 px-[22px] py-[14px] text-left text-[15px] font-semibold text-[var(--ios-red)]"
            >
              <LogOut className="h-[17px] w-[17px]" />
              Déconnexion
            </button>
          </div>
        ) : (
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
        )}
      </aside>

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
        {native ? (
          <header className="native-bar sticky top-0 z-30 flex h-[52px] items-center border-b border-black/[0.08] bg-white/85 px-2 backdrop-blur-xl dark:border-[var(--border)] dark:bg-[var(--surface)] lg:hidden">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              aria-label="Ouvrir le menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-[19px] w-[19px] text-[var(--ios-ink)] dark:text-slate-100" strokeWidth={2.4} />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center">
              {onDashboard ? (
                <BrandLogo file="edufaso-logo-tight.png" className="h-7 w-auto max-w-[9rem]" imgClassName="h-7" />
              ) : (
                <h1 className="truncate px-1 text-[17px] font-semibold text-[var(--ios-ink)] dark:text-slate-100">
                  {pageTitle}
                </h1>
              )}
            </div>
            {canSearch ? (
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                aria-label="Rechercher"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-5 w-5" />
              </button>
            ) : null}
            <Link
              to="/profil"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--ios-navy)] dark:text-brand-300"
              aria-label="Profil"
            >
              <CircleUser className="h-[25px] w-[25px]" strokeWidth={1.7} />
            </Link>
          </header>
        ) : (
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
        )}
        {native ? <OfflineBanner /> : null}
        {pullIndicator}

        <main
          className={cn(
            "flex-1 p-4 sm:p-6 lg:p-8",
            native && "px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3",
          )}
        >
          <ErrorBoundary
            scope="page"
            compact
            resetKeys={[location.pathname, location.search]}
          >
            {native ? (
              <div key={location.pathname} className="native-page-enter">
                <Outlet />
              </div>
            ) : (
              <Outlet />
            )}
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
