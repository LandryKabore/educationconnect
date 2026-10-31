import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { APP_PUBLIC_URL, WEBSITE_URL } from "@/lib/config";
import { toAuthEmail } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { BrandLogo } from "@/components/BrandLogo";
import { Button, Card, Input, Label } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

function recoveryRedirectUrl() {
  const base =
    (APP_PUBLIC_URL || WEBSITE_URL || window.location.origin).replace(/\/$/, "");
  return `${base}/reinitialiser-mot-de-passe`;
}

export default function MotDePasseOublie() {
  const [identifiant, setIdentifiant] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = identifiant.trim();
    if (!raw) return;

    const email = toAuthEmail(raw);
    const isLocalAuth = email.endsWith("@edufaso.local");

    setSubmitting(true);
    try {
      if (isLocalAuth) {
        // School-issued IDs have no deliverable mailbox — don't call Auth.
        setSent(true);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectUrl(),
      });
      if (error) throw error;
      setSent(true);
    } catch {
      toast.error("Impossible d’envoyer le lien. Réessayez ou contactez l’établissement.");
    } finally {
      setSubmitting(false);
    }
  };

  const email = toAuthEmail(identifiant.trim());
  const isLocalAuth = email.endsWith("@edufaso.local");

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-[#243044] dark:to-[#1a2030]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BrandLogo className="mx-auto h-20 w-auto max-w-[12rem] rounded-2xl" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Mot de passe oublié
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Indiquez l’identifiant ou l’e-mail de votre compte EduFaso.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            {isLocalAuth ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">Identifiant scolaire</p>
                <p className="mt-1">
                  Les comptes créés par l’établissement (sans e-mail personnel)
                  ne peuvent pas recevoir de lien de réinitialisation. Contactez
                  l’administration de votre école pour obtenir un nouveau mot de
                  passe.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-medium">Vérifiez votre boîte mail</p>
                <p className="mt-1">
                  Si un compte existe pour{" "}
                  <span className="font-medium">{identifiant.trim()}</span>, un
                  lien de réinitialisation vient d’être envoyé. Le lien expire
                  après quelques minutes.
                </p>
              </div>
            )}
            <Link
              to="/connexion"
              className="block text-center text-sm font-medium text-brand-700 hover:underline"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-6 space-y-4"
          >
            <div>
              <Label htmlFor="identifiant">Identifiant ou e-mail</Label>
              <Input
                id="identifiant"
                value={identifiant}
                onChange={(e) => setIdentifiant(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <p className="text-xs text-slate-500">
              Si vous vous connectez avec un identifiant scolaire (sans @),
              adressez-vous à votre établissement. Seuls les comptes liés à un
              vrai e-mail peuvent recevoir un lien de réinitialisation.
            </p>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Envoi…" : "Envoyer le lien"}
            </Button>
            <p className="text-center text-sm">
              <Link
                to="/connexion"
                className="text-brand-700 hover:underline"
              >
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
