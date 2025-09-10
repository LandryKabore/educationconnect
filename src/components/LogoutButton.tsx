import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export function LogoutButton() {
  const navigate = useNavigate();

  const onLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been signed out." });
    navigate("/auth", { replace: true });
  };

  return (
    <Button variant="secondary" size="sm" onClick={onLogout}>
      Logout
    </Button>
  );
}
