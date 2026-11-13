import { createContext, useContext, type Context } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AppRole, Profile, School, UserRoleRow } from "@/lib/types";

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  /** Real role ignoring support mode */
  realRole: AppRole | null;
  roles: UserRoleRow[];
  schoolId: string | null;
  schools: School[];
  loading: boolean;
  supportSchoolId: string | null;
  enterSupportMode: (schoolId: string) => void;
  exitSupportMode: () => void;
  signIn: (identifiant: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completePasswordChange: (newPassword: string) => Promise<void>;
  homePath: string;
}

const authContextGlobal = globalThis as typeof globalThis & {
  __edufasoAuthContext?: Context<AuthState | null>;
};

// Reuse the same Context across Vite HMR so useAuth doesn't go blank mid-session.
export const AuthContext =
  authContextGlobal.__edufasoAuthContext ??
  createContext<AuthState | null>(null);
authContextGlobal.__edufasoAuthContext = AuthContext;

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
