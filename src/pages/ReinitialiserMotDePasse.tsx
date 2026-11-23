import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, KeyRound, ShieldCheck, X } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  PASSWORD_RULES,
  isPasswordStrong,
  passwordStrengthError,
} from "@/lib/passwordRules";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Button, Label, PasswordInput } from "@/components/ui";

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
      <AuthShell
      panelTitle="Un nouveau mot de passe"
      panelBody="Choisissez un mot de passe que vous seul connaissez."
      title="Lien invalide ou expiré"
      subtitle="Demandez un nouveau lien de réinitialisation, ou connectez-vous si vous connaissez déjà votre mot de passe."
    >
          <div className="flex flex-col gap-3">
            <Link to="/mot-de-passe-oublie">
              <Button size="lg" className="h-12 w-full rounded-md font-bold">Nouveau lien</Button>
            </Link>
            <Link
              to="/connexion"
              className="text-center text-sm font-semibold text-brand-700 hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
      </AuthShell>
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
    <AuthShell
      panelTitle="Un nouveau mot de passe"
      panelBody="Choisissez un mot de passe que vous seul connaissez."
      points={[
        { icon: KeyRound, title: "Au moins 8 caractères", body: "Avec une majuscule, un chiffre et un caractère spécial." },
        { icon: ShieldCheck, title: "Gardez-le secret", body: "Personne à l’école ne vous le demandera." },
      ]}
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe sécurisé pour votre compte."
    >
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4"
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
            size="lg"
            disabled={submitting || !isPasswordStrong(password)}
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
    </AuthShell>
  );
}
