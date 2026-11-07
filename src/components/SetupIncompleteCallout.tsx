import { Link } from "react-router-dom";
import { ChevronRight, ListChecks } from "lucide-react";
import { enterSetupGuide } from "@/components/SetupGuideBar";
import { setupGuideHref } from "@/lib/schoolSetup";
import { Button } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSchoolSetupProgress } from "@/hooks/useSchoolSetupProgress";

/**
 * School-admin overview banner. Shown only when required setup steps are still
 * to do — same progress rules as the configuration guide, no extra permissions.
 */
export function SetupIncompleteCallout() {
  const { role } = useAuth();
  const { progress, nextStep, isLoading, isError, counts } = useSchoolSetupProgress();

  if (role !== "school_admin") return null;
  if (isLoading || isError || !counts || !progress || progress.complete || !nextStep) {
    return null;
  }

  const progressLabel = `Configuration : ${progress.doneRequired} sur ${progress.totalRequired} étapes obligatoires`;

  return (
    <section
      aria-label="Configuration incomplète"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/40 dark:bg-amber-950/40"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            Configuration incomplète
          </p>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
            <span className="font-semibold tabular-nums">
              {progress.doneRequired}/{progress.totalRequired}
            </span>{" "}
            étapes obligatoires · Prochaine étape : {nextStep.title}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/60"
            role="progressbar"
            aria-valuenow={progress.doneRequired}
            aria-valuemin={0}
            aria-valuemax={progress.totalRequired}
            aria-label={progressLabel}
          >
            <div
              className="h-full rounded-full bg-amber-600"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
          <Link
            to={setupGuideHref(nextStep.to)}
            onClick={() => enterSetupGuide()}
          >
            <Button size="sm" className="w-full sm:w-auto">
              Continuer : {nextStep.title}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/ecole/configuration" onClick={() => enterSetupGuide()}>
            <Button size="sm" variant="outline" className="w-full sm:w-auto">
              <ListChecks className="h-4 w-4" />
              Ouvrir le guide
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
