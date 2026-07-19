import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ListChecks, X } from "lucide-react";
import { useSchoolSetupProgress } from "@/hooks/useSchoolSetupProgress";
import {
  SCHOOL_SETUP_STEPS,
  type SetupStepId,
} from "@/lib/schoolSetup";
import { Button } from "@/components/ui";

const SETUP_FLAG = "ef_setup_guide";

const PATH_TO_STEP: { prefix: string; stepId: SetupStepId }[] = [
  { prefix: "/ecole/parametres", stepId: "profil" },
  { prefix: "/annees", stepId: "annee" },
  { prefix: "/matieres", stepId: "matieres" },
  { prefix: "/programmes", stepId: "programmes" },
  { prefix: "/classes", stepId: "classes" },
  { prefix: "/enseignants", stepId: "enseignants" },
  { prefix: "/eleves", stepId: "eleves" },
  { prefix: "/parents", stepId: "parents" },
  { prefix: "/emplois-du-temps", stepId: "emploi" },
];

function stepFromPath(pathname: string): SetupStepId | null {
  const hit = PATH_TO_STEP.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );
  return hit?.stepId ?? null;
}

function withSetupQuery(to: string) {
  const sep = to.includes("?") ? "&" : "?";
  return `${to}${sep}setup=1`;
}

export function enterSetupGuide() {
  sessionStorage.setItem(SETUP_FLAG, "1");
}

export function exitSetupGuide() {
  sessionStorage.removeItem(SETUP_FLAG);
}

/** Sticky bar: next step when navigating from the configuration guide. */
export function SetupGuideBar() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { steps, progress } = useSchoolSetupProgress();
  const [guideOn, setGuideOn] = useState(
    () => sessionStorage.getItem(SETUP_FLAG) === "1",
  );

  const setupFlag = params.get("setup");

  useEffect(() => {
    if (setupFlag !== "1") return;
    enterSetupGuide();
    setGuideOn(true);
    setParams(
      (prev) => {
        if (!prev.get("setup")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("setup");
        return next;
      },
      { replace: true },
    );
  }, [setupFlag, setParams]);

  let stepId = stepFromPath(location.pathname);

  if (stepId === "enseignants" && steps.length) {
    const teachersDone =
      steps.find((s) => s.id === "enseignants")?.status === "done";
    const assignDone =
      steps.find((s) => s.id === "affectations")?.status === "done";
    if (teachersDone && !assignDone) stepId = "affectations";
  }

  // /enseignants?assign=1 → always show Affectations step in the guide
  if (
    location.pathname === "/enseignants" &&
    new URLSearchParams(location.search).get("assign") === "1"
  ) {
    stepId = "affectations";
  }

  if (!guideOn || !stepId) return null;

  const current =
    steps.find((s) => s.id === stepId) ??
    SCHOOL_SETUP_STEPS.find((s) => s.id === stepId);
  if (!current) return null;

  const idx = SCHOOL_SETUP_STEPS.findIndex((s) => s.id === stepId);
  const nextDef = SCHOOL_SETUP_STEPS[idx + 1];
  const doneLabel = steps.find((s) => s.id === stepId)?.status === "done";

  const nextLabel = nextDef
    ? doneLabel
      ? `Suivant : ${nextDef.title}`
      : `Passer à : ${nextDef.title}`
    : null;

  return (
    <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
            Configuration · Étape {current.order}/{SCHOOL_SETUP_STEPS.length}
            {progress ? ` · ${progress.percent} %` : ""}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 font-semibold text-brand-950">
            {current.title}
            {doneLabel ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                <Check className="h-4 w-4" />
                Fait
              </span>
            ) : (
              <span className="text-sm font-medium text-amber-800">En cours</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/ecole/configuration"
            onClick={() => {
              enterSetupGuide();
              setGuideOn(true);
            }}
          >
            <Button type="button" size="sm" variant="outline">
              <ListChecks className="h-4 w-4" />
              Guide
            </Button>
          </Link>

          {nextDef && nextLabel ? (
            <Link
              to={withSetupQuery(nextDef.to)}
              onClick={() => {
                enterSetupGuide();
                setGuideOn(true);
              }}
            >
              <Button type="button" size="sm">
                {nextLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Link
              to="/ecole/configuration"
              onClick={() => {
                exitSetupGuide();
                setGuideOn(false);
              }}
            >
              <Button type="button" size="sm">
                Terminer
                <Check className="h-4 w-4" />
              </Button>
            </Link>
          )}

          <button
            type="button"
            className="rounded-lg p-2 text-brand-700 hover:bg-brand-100"
            title="Quitter le guide"
            onClick={() => {
              exitSetupGuide();
              setGuideOn(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
