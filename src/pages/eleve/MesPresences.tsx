import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { AttendanceBoard } from "@/components/AttendanceBoard";

export default function MesPresences() {
  const { user } = useAuth();
  const { markSeen } = usePresencePendingChanges();
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  return <AttendanceBoard studentId={user?.id} keyRoot="mes-presences" audience="student" title="Mes présences" />;
}
