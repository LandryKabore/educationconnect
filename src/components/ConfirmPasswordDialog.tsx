import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { fromAuthEmail } from "@/lib/utils";
import { Button, Label, PasswordInput } from "@/components/ui";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onVerified: () => void | Promise<void>;
};

/** Ask the signed-in admin to re-enter their password before a destructive action. */
export function ConfirmPasswordDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  onCancel,
  onVerified,
}: Props) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      setChecking(false);
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const identifiant = fromAuthEmail(user?.email) || user?.email || "votre compte";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setError("Session introuvable. Reconnectez-vous.");
      return;
    }
    if (!password.trim()) {
      setError("Saisissez votre mot de passe.");
      return;
    }

    setChecking(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password.trim(),
    });

    if (authError) {
      setChecking(false);
      setError("Mot de passe incorrect.");
      return;
    }

    try {
      await onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          Compte : <span className="font-medium text-slate-700">{identifiant}</span>
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="confirm-admin-password">Mot de passe</Label>
            <PasswordInput
              id="confirm-admin-password"
              ref={inputRef}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              autoComplete="current-password"
              required
            />
            {error ? (
              <p className="mt-1.5 text-sm text-red-600">{error}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={checking}>
              {checking ? "Vérification…" : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={checking}
              onClick={onCancel}
            >
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
