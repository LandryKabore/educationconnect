import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  School,
  Settings,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentsWithoutClassCount } from "@/hooks/useStudentsWithoutClassCount";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useStudentTimetableRealtime, useEdtPendingChanges } from "@/hooks/useStudentTimetableUpdates";
import { LiveClockWeather } from "@/components/LiveClockWeather";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui";
import { cn, fullName } from "@/lib/utils";
import type { AppRole } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { isDesktopApp } from "@/lib/platform";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badgeKey?: "eleves-sans-classe" | "messages-unread" | "edt-updates";
}

const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  super_admin: [
    { to: "/admin", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/admin/ecoles", label: "Écoles", icon: <School className="h-4 w-4" /> },
    { to: "/admin/utilisateurs", label: "Utilisateurs", icon: <Users className="h-4 w-4" /> },
    { to: "/admin/invitations", label: "Invitations", icon: <MessageSquare className="h-4 w-4" /> },
    { to: "/admin/rapports", label: "Rapports", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/admin/abonnements", label: "Abonnements", icon: <BookOpen className="h-4 w-4" /> },
    { to: "/admin/parametres", label: "Paramètres", icon: <Calendar className="h-4 w-4" /> },
    { to: "/admin/audit", label: "Journal d'audit", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/admin/super-admins", label: "Super admins", icon: <User className="h-4 w-4" /> },
  ],
  school_admin: [
    { to: "/ecole", label: "Mon école", icon: <School className="h-4 w-4" /> },
    {
      to: "/ecole/configuration",
      label: "Configuration",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      to: "/ecole/parametres",
      label: "Paramètres école",
      icon: <Settings className="h-4 w-4" />,
    },
    { to: "/annees", label: "Années scolaires", icon: <Calendar className="h-4 w-4" /> },
    { to: "/matieres", label: "Matières", icon: <BookOpen className="h-4 w-4" /> },
    { to: "/classes", label: "Classes", icon: <Users className="h-4 w-4" /> },
    { to: "/programmes", label: "Programmes", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/enseignants", label: "Enseignants", icon: <User className="h-4 w-4" /> },
    { to: "/eleves", label: "Élèves", icon: <GraduationCap className="h-4 w-4" />, badgeKey: "eleves-sans-classe" },
    { to: "/parents", label: "Parents", icon: <Users className="h-4 w-4" /> },
    { to: "/emplois-du-temps", label: "Emplois du temps", icon: <Calendar className="h-4 w-4" /> },
    { to: "/bulletins", label: "Bulletins", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" />, badgeKey: "messages-unread" },
  ],
  teacher: [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/devoirs", label: "Devoirs", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" />, badgeKey: "messages-unread" },
  ],
  student: [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/mes-notes", label: "Mes notes", icon: <BookOpen className="h-4 w-4" /> },
    { to: "/mes-devoirs", label: "Mes devoirs", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/mes-presences", label: "Mes présences", icon: <CheckCircle2 className="h-4 w-4" /> },
    { to: "/mon-emploi-du-temps", label: "Mon emploi du temps", icon: <Calendar className="h-4 w-4" />, badgeKey: "edt-updates" },
    { to: "/mon-bulletin", label: "Mon bulletin", icon: <GraduationCap className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" />, badgeKey: "messages-unread" },
  ],
  parent: [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/enfants", label: "Enfants", icon: <Users className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" />, badgeKey: "messages-unread" },
  ],
};

const COMMON_NAV: NavItem[] = [
  { to: "/profil", label: "Profil", icon: <User className="h-4 w-4" /> },
];

const DOWNLOAD_NAV: NavItem = {
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

  const roleNav = role ? NAV_BY_ROLE[role] : [];
  const navItems = [
    ...roleNav,
    ...COMMON_NAV,
    ...(isDesktopApp() ? [] : [DOWNLOAD_NAV]),
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
  const { data: unreadMessagesCount = 0 } = useUnreadMessagesCount();
  useStudentTimetableRealtime();
  const { pendingCount: edtUpdatesCount = 0 } = useEdtPendingChanges();

  const badgeFor = (item: NavItem): { count: number; title: string; tone: "amber" | "rose" | "brand" } | null => {
    if (item.badgeKey === "eleves-sans-classe" && sansClasseCount > 0) {
      return {
        count: sansClasseCount,
        title: `${sansClasseCount} élève(s) sans classe`,
        tone: "amber",
      };
    }
    if (item.badgeKey === "messages-unread" && unreadMessagesCount > 0) {
      return {
        count: unreadMessagesCount,
        title: `${unreadMessagesCount} message(s) non lu(s)`,
        tone: "rose",
      };
    }
    if (item.badgeKey === "edt-updates" && edtUpdatesCount > 0) {
      return {
        count: edtUpdatesCount,
        title: `${edtUpdatesCount} modification(s) de l’emploi du temps`,
        tone: "brand",
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
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-[var(--border)]">
          <div>
            <p className="text-lg font-bold text-brand-700">EduFaso</p>
            {schoolName ? (
              <p className="text-xs text-slate-500">{schoolName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-slate-200 px-3 py-3 dark:border-[var(--border)]">
          <LiveClockWeather />
          <ThemeToggle className="w-full justify-center" />
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to !== "/tableau-de-bord" &&
                item.to !== "/ecole" &&
                location.pathname.startsWith(item.to));
            const badge = badgeFor(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-brand-50 text-brand-800"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
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
        </nav>

        <div className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]">
          <div className="mb-3">
            <p className="text-sm font-medium text-slate-900">
              {fullName(profile?.first_name, profile?.last_name)}
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
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex-1 font-semibold text-brand-700">EduFaso</span>
          <ThemeToggle compact />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
