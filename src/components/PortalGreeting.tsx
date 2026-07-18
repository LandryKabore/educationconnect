import { useAuth } from "@/contexts/AuthContext";
import { getTimeGreeting } from "@/lib/greeting";
import { cn, fullName } from "@/lib/utils";

type Props = {
  className?: string;
};

export function PortalGreeting({ className }: Props) {
  const { profile } = useAuth();
  const hasName = Boolean(
    profile?.first_name?.trim() || profile?.last_name?.trim(),
  );
  const name = hasName
    ? fullName(profile?.first_name, profile?.last_name)
    : "";
  const greeting = getTimeGreeting();

  return (
    <div className={cn("mb-6 animate-greeting", className)}>
      <p className="text-sm font-medium text-brand-700">
        {greeting}{" "}
        <span className="animate-greeting-wave" aria-hidden>
          👋
        </span>
      </p>
      {hasName ? (
        <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 animate-greeting-name">
          {name}
        </h2>
      ) : null}
    </div>
  );
}
