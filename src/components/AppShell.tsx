import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  Download,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  School,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui";
import { cn, fullName } from "@/lib/utils";
import type { AppRole } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  super_admin: [
    { to: "/admin/ecoles", label: "Écoles", icon: <School className="h-4 w-4" /> },
  ],
  school_admin: [
    { to: "/ecole", label: "Mon école", icon: <School className="h-4 w-4" /> },
    { to: "/annees", label: "Années scolaires", icon: <Calendar className="h-4 w-4" /> },
    { to: "/classes", label: "Classes", icon: <Users className="h-4 w-4" /> },
    { to: "/matieres", label: "Matières", icon: <BookOpen className="h-4 w-4" /> },
    { to: "/eleves", label: "Élèves", icon: <GraduationCap className="h-4 w-4" /> },
    { to: "/enseignants", label: "Enseignants", icon: <User className="h-4 w-4" /> },
    { to: "/parents", label: "Parents", icon: <Users className="h-4 w-4" /> },
    { to: "/emplois-du-temps", label: "Emplois du temps", icon: <Calendar className="h-4 w-4" /> },
    { to: "/bulletins", label: "Bulletins", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
  ],
  teacher: [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/devoirs", label: "Devoirs", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
  ],
  student: [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/mes-notes", label: "Mes notes", icon: <BookOpen className="h-4 w-4" /> },
    { to: "/mes-devoirs", label: "Mes devoirs", icon: <ClipboardList className="h-4 w-4" /> },
    { to: "/mon-emploi-du-temps", label: "Mon emploi du temps", icon: <Calendar className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
  ],
  parent: [
    { to: "/tableau-de-bord", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/enfants", label: "Enfants", icon: <Users className="h-4 w-4" /> },
    { to: "/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
  ],
};

const COMMON_NAV: NavItem[] = [
  { to: "/profil", label: "Profil", icon: <User className="h-4 w-4" /> },
  { to: "/telecharger", label: "Télécharger l'app", icon: <Download className="h-4 w-4" /> },
];

export function AppShell() {
  const { profile, role, schools, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const roleNav = role ? NAV_BY_ROLE[role] : [];
  const navItems = [...roleNav, ...COMMON_NAV];

  const handleLogout = async () => {
    await signOut();
    navigate("/connexion");
  };

  const schoolName = schools[0]?.name;

  return (
    <div className="flex min-h-screen bg-slate-50">
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
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
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

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to !== "/tableau-de-bord" &&
                item.to !== "/ecole" &&
                location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-brand-50 text-brand-800"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-brand-700">EduFaso</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
