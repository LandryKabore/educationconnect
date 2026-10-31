import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  PASSWORD_RULES,
  isPasswordStrong,
  passwordStrengthError,
} from "@/lib/passwordRules";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { BrandLogo } from "@/components/BrandLogo";
import { Button, Card, Label, PasswordInput } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function ReinitialiserMotDePasse() {
  const { session, completePasswordChange, refreshProfile, homePath } =
    useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const finish = (ok: boolean) => {
      if (cancelled) return;
      setChecking(false);
      if (!ok) {
        // leave session null path to the invalid UI below
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      finish(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "PASSWORD_RECOVERY" || sess) {
        if (!cancelled) setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const activeSession = session;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-[#243044] dark:to-[#1a2030]">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md text-center">
          <BrandLogo className="mx-auto h-16 w-auto max-w-[10rem] rounded-2xl" />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
            Lien invalide ou expiré
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Demandez un nouveau lien de réinitialisation, ou connectez-vous si
            vous connaissez déjà votre mot de passe.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/mot-de-passe-oublie">
              <Button className="w-full">Nouveau lien</Button>
            </Link>
            <Link
              to="/connexion"
              className="text-sm text-brand-700 hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const strengthErr = passwordStrengthError(password);
    if (strengthErr) {
      toast.error(strengthErr);
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordChange(password);
      await refreshProfile();
      toast.success("Mot de passe mis à jour");
      navigate(homePath || "/", { replace: true });
    } catch {
      toast.error("Impossible de mettre à jour le mot de passe.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-[#243044] dark:to-[#1a2030]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <BrandLogo className="mx-auto h-16 w-auto max-w-[10rem] rounded-2xl" />
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
          Nouveau mot de passe
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Choisissez un mot de passe sécurisé pour votre compte.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 space-y-4"
        >
          <div>
            <Label htmlFor="newPassword">Nouveau mot de passe</Label>
            <PasswordInput
              id="newPassword"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <ul className="mt-2 space-y-1">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li
                    key={rule.id}
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      ok ? "text-emerald-700" : "text-slate-500",
                    )}
                  >
                    {ok ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <Label htmlFor="confirm">Confirmer le mot de passe</Label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !isPasswordStrong(password)}
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
