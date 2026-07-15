import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  roles: UserRoleRow[];
  schoolId: string | null;
  schools: School[];
  loading: boolean;
  signIn: (identifiant: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completePasswordChange: (newPassword: string) => Promise<void>;
  homePath: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (userId: string) => {
    const [{ data: profil }, { data: roleRows }] = await Promise.all([
      supabase.from("profils").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("roles_utilisateurs")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true),
    ]);

    setProfile((profil as Profile) ?? null);
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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadUserData(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        void loadUserData(sess.user.id);
      } else {
        setProfile(null);
        setRoles([]);
        setSchools([]);
      }
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

  const schoolId = useMemo(() => {
    const withSchool = roles.find((r) => r.school_id);
    return withSchool?.school_id ?? schools[0]?.id ?? null;
  }, [roles, schools]);

  const signIn = async (identifiant: string, password: string) => {
    const email = toAuthEmail(identifiant);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setSchools([]);
  };

  const refreshProfile = async () => {
    if (session?.user) await loadUserData(session.user.id);
  };

  const completePasswordChange = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    if (session?.user) {
      await supabase
        .from("profils")
        .update({ must_change_password: false })
        .eq("id", session.user.id);
      await loadUserData(session.user.id);
    }
  };

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    role: primaryRole,
    roles,
    schoolId,
    schools,
    loading,
    signIn,
    signOut,
    refreshProfile,
    completePasswordChange,
    homePath: primaryRole ? ROLE_HOME[primaryRole] : "/connexion",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
