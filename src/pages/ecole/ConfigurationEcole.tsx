import { Link } from "react-router-dom";
import { Check, ChevronRight, Circle, Sparkles } from "lucide-react";
import { useSchoolSetupProgress } from "@/hooks/useSchoolSetupProgress";
import { enterSetupGuide } from "@/components/SetupGuideBar";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

function setupLink(to: string) {
  const sep = to.includes("?") ? "&" : "?";
  return `${to}${sep}setup=1`;
}

export default function ConfigurationEcole() {
  const { steps, progress, nextStep, isLoading, counts } = useSchoolSetupProgress();

  if (isLoading && !counts) {
    return <p className="text-slate-500">Chargement de la configuration…</p>;
  }

  if (!counts) {
    return <EmptyState message="Aucune école associée à votre compte." />;
  }

  return (
    <div>
      <PageHeader
        title="Configuration de l’école"
        subtitle="Suivez ces étapes dans l’ordre pour préparer l’année scolaire."
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Progression obligatoire</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {progress?.doneRequired ?? 0} / {progress?.totalRequired ?? 0}
              <span className="ml-2 text-base font-normal text-slate-500">
                ({progress?.percent ?? 0} %)
              </span>
            </p>
          </div>
          {progress?.complete ? (
            <Badge tone="success">École prête</Badge>
          ) : nextStep ? (
            <Link to={setupLink(nextStep.to)} onClick={() => enterSetupGuide()}>
              <Button>
                Continuer : {nextStep.title}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          ) : null}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>
      </Card>

      {progress?.complete ? (
        <Card className="mb-6 border-brand-200 bg-brand-50">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-brand-700" />
            <div>
              <p className="font-semibold text-brand-900">Configuration de base terminée</p>
              <p className="mt-1 text-sm text-brand-800">
                Vous pouvez encore compléter les parents et l’emploi du temps, puis gérer les
                bulletins et les messages au quotidien.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/bulletins">
                  <Button size="sm" variant="outline">
                    Bulletins
                  </Button>
                </Link>
                <Link to="/messages">
                  <Button size="sm" variant="outline">
                    Messages
                  </Button>
                </Link>
                <Link to="/ecole">
                  <Button size="sm">Retour à mon école</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <ol className="space-y-3">
        {steps.map((step) => {
          const done = step.status === "done";
          const optional = step.optional && step.status !== "done";
          return (
            <li key={step.id}>
              <Link
                to={setupLink(step.to)}
                onClick={() => enterSetupGuide()}
                className="block"
              >
                <Card
                  className={cn(
                    "flex items-start gap-4 transition hover:border-brand-300",
                    done && "border-emerald-200 bg-emerald-50/40",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      done
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">
                        Étape {step.order}
                      </span>
                      <h3 className="font-semibold text-slate-900">{step.title}</h3>
                      {done ? <Badge tone="success">Fait</Badge> : null}
                      {optional ? <Badge>Optionnel</Badge> : null}
                      {!done && !optional ? <Badge tone="warning">À faire</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
                </Card>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
