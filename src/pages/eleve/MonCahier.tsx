import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { CahierFeedView } from "@/components/CahierFeedView";
import { EmptyState, PageHeader } from "@/components/ui";
import { ScreenSkeleton } from "@/components/Skeleton";
import { QueryError } from "@/components/QueryError";
import { isNativeApp } from "@/lib/platform";

/** Student: the lesson log of his/her class. */
export default function MonCahier() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mon-cahier-classe", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as { class_section_id: string; classes: { name: string } | null } | null;
    },
  });
  return (
    <div>
      {isNativeApp() ? null : (
        <PageHeader
          title="Cahier de textes"
          subtitle={data?.classes?.name ? `Classe ${data.classes.name} · cours et travail à faire` : "Cours et travail à faire"}
        />
      )}
      {isLoading ? (
        <ScreenSkeleton />
      ) : isError ? (
        <QueryError message="Impossible de charger le cahier de textes." onRetry={() => void refetch()} />
      ) : !data ? (
        <EmptyState message="Vous n'êtes inscrit dans aucune classe pour le moment." />
      ) : (
        <CahierFeedView classId={data.class_section_id} />
      )}
    </div>
  );
}
