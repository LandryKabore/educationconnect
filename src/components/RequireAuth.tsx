import { PropsWithChildren, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { LogoutButton } from "./LogoutButton";

interface RequireAuthProps extends PropsWithChildren {
  requiredRole?: string;
}


export function RequireAuth({ children, requiredRole }: RequireAuthProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        setTimeout(() => {
          fetchUserRole(sess.user.id);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setLoading(false);
        navigate("/auth", { replace: true });
      } else {
        fetchUserRole(data.session.user.id);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .single();
      
      setUserRole(profile?.role || null);
      
      // If a specific role is required and user doesn't have it, redirect to home
      if (requiredRole && profile?.role !== requiredRole) {
        console.log(`User role ${profile?.role} doesn't match required role ${requiredRole}`);
        navigate("/", { replace: true });
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-50">
        <LogoutButton />
      </div>
      {children}
    </div>
  );
}
