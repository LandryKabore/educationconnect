import { useAuth } from "@/contexts/AuthContext";
import { getTimeGreeting } from "@/lib/greeting";
import { cn, personName } from "@/lib/utils";

type Props = {
  className?: string;
};

export function PortalGreeting({ className }: Props) {
  const { profile } = useAuth();
  const name = personName(profile?.first_name, profile?.last_name);
  const greeting = getTimeGreeting();

  return (
    <div className={cn("mb-6 animate-greeting", className)}>
      <p className="text-sm font-medium text-brand-700">
        {greeting}{" "}
        <span className="animate-greeting-wave" aria-hidden>
          👋
        </span>
      </p>
      {name ? (
        <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 animate-greeting-name dark:text-slate-100">
          {name}
        </h2>
      ) : (
        <span className="mt-1 inline-block h-7 w-40 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
      )}
    </div>
  );
}
