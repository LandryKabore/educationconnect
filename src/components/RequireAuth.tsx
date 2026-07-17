import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { needsProfileCompletion } from "@/lib/profileCompletion";
import type { AppRole } from "@/lib/types";

const PROFILE_GATE_PATHS = new Set([
  "/premiere-connexion",
  "/completer-profil",
]);

export function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: AppRole[];
}) {
  const { session, profile, role, realRole, loading } = useAuth();
  const location = useLocation();
  const effectiveRole = role ?? realRole;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/connexion" state={{ from: location }} replace />;
  }

  if (
    profile?.must_change_password &&
    location.pathname !== "/premiere-connexion"
  ) {
    return <Navigate to="/premiere-connexion" replace />;
  }

  if (
    !profile?.must_change_password &&
    needsProfileCompletion(profile, effectiveRole) &&
    !PROFILE_GATE_PATHS.has(location.pathname)
  ) {
    return <Navigate to="/completer-profil" replace />;
  }

  if (roles?.length) {
    const allowed =
      (role != null && roles.includes(role)) ||
      (realRole != null && roles.includes(realRole));
    if (!allowed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Accès non autorisé</h1>
          <p className="text-slate-500">Vous n'avez pas les droits pour cette page.</p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
