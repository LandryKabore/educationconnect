import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { AttendanceOverview } from "@/components/AttendanceOverview";
import { PageHeader } from "@/components/ui";

export default function MesPresences() {
  const { user } = useAuth();
  const { markSeen } = usePresencePendingChanges();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Mes présences"
        subtitle="Ton taux de présence, tes absences et tes retards"
      />
      <AttendanceOverview keyRoot="mes-presences" studentId={user?.id} audience="student" />
    </div>
  );
}
