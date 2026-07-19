import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  ROLE_HOME,
  type AppRole,
  type Profile,
  type School,
  type UserRoleRow,
} from "@/lib/types";
import { toAuthEmail } from "@/lib/utils";
import { isPasswordStrong } from "@/lib/passwordRules";

const SUPPORT_KEY = "ef_support_school";

interface AuthState {
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
const AuthContext =
  authContextGlobal.__edufasoAuthContext ??
  createContext<AuthState | null>(null);
authContextGlobal.__edufasoAuthContext = AuthContext;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportSchoolId, setSupportSchoolId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(SUPPORT_KEY);
  });

  const loadUserData = useCallback(async (userId: string) => {
    const [
      { data: profil, error: profilError },
      { data: roleRows, error: rolesError },
    ] = await Promise.all([
      supabase.from("profils").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("roles_utilisateurs")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true),
    ]);

    // Keep the previous profile on transient fetch errors (avoids "Utilisateur" flash).
    if (!profilError) {
      setProfile((profil as Profile) ?? null);
    }

    if (rolesError) return;

    const list = (roleRows as UserRoleRow[]) ?? [];
    setRoles(list);

    const schoolIds = [
      ...new Set(list.map((r) => r.school_id).filter(Boolean) as string[]),
    ];
    if (schoolIds.length) {
      const { data: schoolRows } = await supabase
        .from("ecoles")
        .select("*")
        .in("id", schoolIds);
      setSchools((schoolRows as School[]) ?? []);
    } else if (list.some((r) => r.role === "super_admin")) {
      const { data: schoolRows } = await supabase
        .from("ecoles")
        .select("*")
        .eq("active", true);
      setSchools((schoolRows as School[]) ?? []);
    } else {
      setSchools([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let loadGen = 0;

    const clearUserState = () => {
      setProfile(null);
      setRoles([]);
      setSchools([]);
      setSupportSchoolId(null);
      sessionStorage.removeItem(SUPPORT_KEY);
    };

    const applySession = async (
      sess: Session | null,
      { blockUi }: { blockUi: boolean },
    ) => {
      const gen = ++loadGen;
      if (blockUi) setLoading(true);
      setSession(sess);
      if (sess?.user) {
        await loadUserData(sess.user.id);
      } else {
        clearUserState();
      }
      if (mounted && gen === loadGen) setLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void applySession(data.session, { blockUi: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;

      // Silent refresh: keep showing the current name; don't blank the UI.
      if (event === "TOKEN_REFRESHED") {
        setSession(sess);
        if (sess?.user) void loadUserData(sess.user.id);
        else clearUserState();
        return;
      }

      // INITIAL_SESSION is covered by getSession(); avoid a double loading flash.
      if (event === "INITIAL_SESSION") return;

      void applySession(sess, {
        blockUi: event === "SIGNED_IN" || event === "SIGNED_OUT",
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const primaryRole = useMemo<AppRole | null>(() => {
    const order: AppRole[] = [
      "super_admin",
      "school_admin",
      "teacher",
      "student",
      "parent",
    ];
    for (const r of order) {
      if (roles.some((x) => x.role === r)) return r;
    }
    return null;
  }, [roles]);

  const inSupport =
    primaryRole === "super_admin" && Boolean(supportSchoolId);

  const role: AppRole | null = inSupport ? "school_admin" : primaryRole;

  const schoolId = useMemo(() => {
    if (inSupport && supportSchoolId) return supportSchoolId;
    const withSchool = roles.find((r) => r.school_id);
    return withSchool?.school_id ?? schools[0]?.id ?? null;
  }, [roles, schools, inSupport, supportSchoolId]);

  const enterSupportMode = useCallback((id: string) => {
    sessionStorage.setItem(SUPPORT_KEY, id);
    setSupportSchoolId(id);
  }, []);

  const exitSupportMode = useCallback(() => {
    sessionStorage.removeItem(SUPPORT_KEY);
    setSupportSchoolId(null);
  }, []);

  const signIn = useCallback(async (identifiant: string, password: string) => {
    const email = toAuthEmail(identifiant);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    if (data.user) {
      await supabase
        .from("profils")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", data.user.id);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setSchools([]);
    sessionStorage.removeItem(SUPPORT_KEY);
    setSupportSchoolId(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadUserData(session.user.id);
  }, [session?.user, loadUserData]);

  const completePasswordChange = useCallback(
    async (newPassword: string) => {
      if (!isPasswordStrong(newPassword)) {
        throw new Error(
          "Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial",
        );
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      if (session?.user) {
        await supabase
          .from("profils")
          .update({ must_change_password: false })
          .eq("id", session.user.id);
        await loadUserData(session.user.id);
      }
    },
    [session?.user, loadUserData],
  );

  const homePath = inSupport
    ? "/ecole"
    : primaryRole
      ? ROLE_HOME[primaryRole]
      : "/connexion";

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role,
      realRole: primaryRole,
      roles,
      schoolId,
      schools,
      loading,
      supportSchoolId: inSupport ? supportSchoolId : null,
      enterSupportMode,
      exitSupportMode,
      signIn,
      signOut,
      refreshProfile,
      completePasswordChange,
      homePath,
    }),
    [
      session,
      profile,
      role,
      primaryRole,
      roles,
      schoolId,
      schools,
      loading,
      inSupport,
      supportSchoolId,
      enterSupportMode,
      exitSupportMode,
      signIn,
      signOut,
      refreshProfile,
      completePasswordChange,
      homePath,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
