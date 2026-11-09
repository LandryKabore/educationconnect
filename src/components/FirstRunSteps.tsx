import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1 as const, label: "Mot de passe" },
  { n: 2 as const, label: "Profil" },
];

/** Première connexion : 1 Mot de passe → 2 Profil. */
export function FirstRunSteps({ current }: { current: 1 | 2 }) {
  return (
    <ol
      className="mt-3 flex gap-2"
      aria-label="Étapes de la première connexion"
    >
      {STEPS.map((step) => {
        const on = step.n === current;
        return (
          <li
            key={step.n}
            aria-current={on ? "step" : undefined}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-center text-[11px] font-extrabold",
              on
                ? "bg-brand-700 text-white"
                : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
            )}
          >
            {step.n} · {step.label}
          </li>
        );
      })}
    </ol>
  );
}
