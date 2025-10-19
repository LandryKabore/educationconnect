import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminFirstLogin } from "@/components/AdminFirstLogin";
import { supabase } from "@/integrations/supabase/client";

export default function AdminFirstLoginPage() {
  const navigate = useNavigate();
  const [adminInfo, setAdminInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFirstLogin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/auth', { replace: true });
          return;
        }

        // Check if user needs password change
        const needsPasswordChange = user.user_metadata?.needs_password_change;
        
        if (!needsPasswordChange) {
          // Already changed password, redirect to dashboard
          navigate('/admin-dashboard', { replace: true });
          return;
        }

        setAdminInfo({
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
          email: user.email,
        });
      } catch (error) {
        console.error('Error checking first login:', error);
        navigate('/auth', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    checkFirstLogin();
  }, [navigate]);

  const handleComplete = () => {
    navigate('/auth', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!adminInfo) {
    return null;
  }

  return <AdminFirstLogin adminInfo={adminInfo} onComplete={handleComplete} />;
}
