import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { needsProfileCompletion } from "@/lib/profileCompletion";
import {
  PASSWORD_RULES,
  isPasswordStrong,
  passwordStrengthError,
} from "@/lib/passwordRules";
import { cn, fromAuthEmail } from "@/lib/utils";
import { Badge, Button, Card, Label, PasswordInput } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function PremiereConnexion() {
  const { t } = useTranslation();
  const {
    session,
    profile,
    role,
    realRole,
    completePasswordChange,
    homePath,
    loading,
    refreshProfile,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const effectiveRole = role ?? realRole;
  const identifiant = fromAuthEmail(session?.user?.email);
  const displayName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!loading && !session) {
    return <Navigate to="/connexion" replace />;
  }

  if (!loading && session && !profile?.must_change_password) {
    if (needsProfileCompletion(profile, effectiveRole)) {
      return <Navigate to="/completer-profil" replace />;
    }
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const strengthErr = passwordStrengthError(password);
    if (strengthErr) {
      toast.error(strengthErr);
      return;
    }
    if (password !== confirm) {
      toast.error(t("premiere.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordChange(password);
      await refreshProfile();
      toast.success("Mot de passe mis à jour");
      navigate("/completer-profil", { replace: true });
    } catch {
      toast.error(t("errors.generic"));
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
        <h1 className="text-xl font-bold text-slate-900">{t("premiere.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("premiere.subtitle")}</p>
        {identifiant || displayName ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            {displayName ? (
              <p className="text-sm font-medium text-slate-900">{displayName}</p>
            ) : null}
            {identifiant ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>Identifiant</span>
                <Badge>{identifiant}</Badge>
              </p>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="newPassword">{t("premiere.newPassword")}</Label>
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
            <Label htmlFor="confirm">{t("premiere.confirm")}</Label>
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
            {submitting ? t("loading") : t("premiere.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
