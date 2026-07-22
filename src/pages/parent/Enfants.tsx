import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotesPendingChanges } from "@/hooks/useNotesRealtime";
import { usePresencePendingChanges } from "@/hooks/usePresenceRealtime";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { joinProfile } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function Enfants() {
  const { user } = useAuth();
  const { markSeen: markNotesSeen } = useNotesPendingChanges();
  const { markSeen: markPresenceSeen } = usePresencePendingChanges();

  useEffect(() => {
    markNotesSeen();
    markPresenceSeen();
  }, [markNotesSeen, markPresenceSeen]);

  const { data: children = [], isLoading } = useQuery({
    queryKey: ["enfants", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("liens_parent_eleve")
        .select("student_id, profils:profils!liens_parent_eleve_student_id_fkey(*)")
        .eq("parent_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id);
    },
  });

  return (
    <div>
      <PageHeader title="Mes enfants" subtitle="Suivi scolaire" />

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : children.length === 0 ? (
        <EmptyState message="Aucun enfant lié à votre compte." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => (
            <Card key={child.id}>
              <h3 className="text-lg font-semibold">
                <PersonName first={child.first_name} last={child.last_name} />
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/enfants/${child.id}/notes`}>
                  <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-brand-300 hover:bg-brand-50">
                    <BookOpen className="h-4 w-4 text-brand-700" />
                    Notes
                  </span>
                </Link>
                <Link to={`/enfants/${child.id}/presences`}>
                  <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-brand-300 hover:bg-brand-50">
                    <ClipboardList className="h-4 w-4 text-brand-700" />
                    Présences
                  </span>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
