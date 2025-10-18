import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type AdminLevel = 'super_admin' | 'school_admin' | null;

interface AdminAccessData {
  adminLevel: AdminLevel;
  accessibleSchoolIds: string[];
  isLoading: boolean;
  hasAccess: boolean;
  schoolNames: Record<string, string>;
}

export function useAdminAccess() {
  const { toast } = useToast();
  const [adminData, setAdminData] = useState<AdminAccessData>({
    adminLevel: null,
    accessibleSchoolIds: [],
    isLoading: true,
    hasAccess: false,
    schoolNames: {},
  });

  useEffect(() => {
    checkAdminAccess();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkAdminAccess();
      } else {
        setAdminData({
          adminLevel: null,
          accessibleSchoolIds: [],
          isLoading: false,
          hasAccess: false,
          schoolNames: {},
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminAccess = async () => {
    try {
      setAdminData(prev => ({ ...prev, isLoading: true }));

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAdminData({
          adminLevel: null,
          accessibleSchoolIds: [],
          isLoading: false,
          hasAccess: false,
          schoolNames: {},
        });
        return;
      }

      // Check if user is super admin
      const { data: isSuperAdmin, error: superAdminError } = await supabase.rpc('is_super_admin');
      if (superAdminError) throw superAdminError;

      if (isSuperAdmin) {
        // Super admin has access to all schools
        const { data: schools, error: schoolsError } = await supabase
          .from('schools')
          .select('id, name')
          .eq('active', true);
        
        if (schoolsError) throw schoolsError;

        const schoolIds = schools?.map(s => s.id) || [];
        const schoolNames = schools?.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {}) || {};

        setAdminData({
          adminLevel: 'super_admin',
          accessibleSchoolIds: schoolIds,
          isLoading: false,
          hasAccess: true,
          schoolNames,
        });
        return;
      }

      // Check if user is school admin
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role, school_id, schools(id, name)')
        .eq('user_id', user.id)
        .eq('role', 'school_admin')
        .eq('active', true);

      if (rolesError) throw rolesError;

      if (userRoles && userRoles.length > 0) {
        const schoolIds = userRoles
          .map(r => r.school_id)
          .filter((id): id is string => id !== null);
        
        const schoolNames = userRoles.reduce((acc, r) => {
          if (r.school_id && r.schools) {
            return { ...acc, [r.school_id]: (r.schools as any).name };
          }
          return acc;
        }, {} as Record<string, string>);

        setAdminData({
          adminLevel: 'school_admin',
          accessibleSchoolIds: schoolIds,
          isLoading: false,
          hasAccess: true,
          schoolNames,
        });
        return;
      }

      // No admin access
      setAdminData({
        adminLevel: null,
        accessibleSchoolIds: [],
        isLoading: false,
        hasAccess: false,
        schoolNames: {},
      });

      toast({
        title: "Unauthorized",
        description: "You must be an admin to access this dashboard.",
        variant: "destructive",
      });
    } catch (error) {
      console.error('Error checking admin access:', error);
      setAdminData({
        adminLevel: null,
        accessibleSchoolIds: [],
        isLoading: false,
        hasAccess: false,
        schoolNames: {},
      });
      toast({
        title: "Error",
        description: "Failed to verify admin access.",
        variant: "destructive",
      });
    }
  };

  return adminData;
}
