import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui";

export function ParentChildBackLink({
  childName,
}: {
  childName?: string | null;
}) {
  return (
    <Link
      to="/enfants"
      className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      {childName
        ? `Retour — ${childName}`
        : "Retour aux enfants"}
    </Link>
  );
}

export function ParentChildGate({
  link,
  isLoading,
  children,
}: {
  link: unknown;
  isLoading: boolean;
  children: ReactNode;
}) {
  if (!link && !isLoading) {
    return <EmptyState message="Accès non autorisé à cet élève." />;
  }
  return <>{children}</>;
}
