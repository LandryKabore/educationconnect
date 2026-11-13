import { CahierFeedView } from "@/components/CahierFeedView";
import { EmptyState, PageHeader } from "@/components/ui";
import {
  childDisplayName,
  useChildEnrollment,
  useParentChildLink,
  useParentChildParams,
} from "@/pages/parent/parentChildAccess";
import {
  ParentChildBackLink,
  ParentChildGate,
} from "@/pages/parent/ParentChildGate";

/** Parent: the lesson log of the child's class. */
export default function EnfantCahier() {
  const id = useParentChildParams();
  const { data: link, isLoading: linkLoading } = useParentChildLink(id);
  const childName = childDisplayName(link?.profils);
  const { data: enrollment, isLoading } = useChildEnrollment(id, !!link);

  return (
    <ParentChildGate link={link} isLoading={linkLoading}>
      <div>
        <ParentChildBackLink childName={childName} />
        <PageHeader
          title={childName ? `Cahier de textes — ${childName}` : "Cahier de textes"}
          subtitle={enrollment?.classes?.name ? `Classe ${enrollment.classes.name} · cours et travail à faire` : undefined}
        />
        {isLoading ? (
          <p className="text-slate-500">Chargement…</p>
        ) : !enrollment ? (
          <EmptyState message="Cet élève n'est dans aucune classe pour le moment." />
        ) : (
          <CahierFeedView classId={enrollment.class_section_id} />
        )}
      </div>
    </ParentChildGate>
  );
}
