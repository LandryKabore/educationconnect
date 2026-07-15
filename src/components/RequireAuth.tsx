import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/lib/types";

export function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: AppRole[];
}) {
  const { session, profile, role, loading } = useAuth();
  const location = useLocation();

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

  if (roles && role && !roles.includes(role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Accès non autorisé</h1>
        <p className="text-slate-500">Vous n'avez pas les droits pour cette page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
