import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Stable JSON compare for form dirty-checking. */
export function isFormDirty(current: unknown, baseline: unknown) {
  return JSON.stringify(current) !== JSON.stringify(baseline);
}

type SaveButtonProps = {
  saving?: boolean;
  /** True when the form has unsaved changes. */
  dirty: boolean;
  /** Extra disable (e.g. incomplete required fields). */
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  saveLabel?: string;
  savedLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/**
 * Save control that shows « À jour » when nothing changed,
 * otherwise « Enregistrer » / « Enregistrement… ».
 */
export function SaveButton({
  saving = false,
  dirty,
  disabled = false,
  type = "submit",
  onClick,
  saveLabel = "Enregistrer",
  savedLabel = "À jour",
  size = "md",
  className,
}: SaveButtonProps) {
  if (!dirty && !saving) {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled
        className={cn(
          "border-emerald-200 bg-emerald-50 text-emerald-800 disabled:opacity-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
          className,
        )}
      >
        <Check className="h-4 w-4" />
        {savedLabel}
      </Button>
    );
  }

  return (
    <Button
      type={type}
      size={size}
      disabled={saving || disabled || !dirty}
      onClick={onClick}
      className={className}
    >
      {saving ? "Enregistrement…" : saveLabel}
    </Button>
  );
}
