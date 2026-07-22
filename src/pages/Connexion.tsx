import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { needsProfileCompletion } from "@/lib/profileCompletion";
import { WEBSITE_URL } from "@/lib/config";
import { isDesktopApp } from "@/lib/platform";
import {
  listSavedLogins,
  removeSavedLogin,
  saveIdentifiant,
  type SavedLogin,
} from "@/lib/savedLogins";
import { BrandLogo } from "@/components/BrandLogo";
import { Button, Card, Input, Label, PasswordInput } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Connexion() {
  const { t } = useTranslation();
  const { signIn, session, profile, role, realRole, homePath, loading } =
    useAuth();
  const navigate = useNavigate();
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<SavedLogin[]>([]);
  const effectiveRole = role ?? realRole;

  useEffect(() => {
    setSaved(listSavedLogins());
  }, []);

  if (!loading && session) {
    if (profile?.must_change_password) {
      return <Navigate to="/premiere-connexion" replace />;
    }
    if (needsProfileCompletion(profile, effectiveRole)) {
      return <Navigate to="/completer-profil" replace />;
    }
    return <Navigate to={homePath} replace />;
  }

  const refreshSaved = () => setSaved(listSavedLogins());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(identifiant, password);
      // Password is never persisted (see lib/savedLogins.ts) — only the
      // identifier is remembered to speed up the next login on this device.
      saveIdentifiant(identifiant);
      refreshSaved();
      navigate("/");
    } catch {
      toast.error(t("connexions.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const pickSaved = (entry: SavedLogin) => {
    setIdentifiant(entry.identifiant);
    document.getElementById("password")?.focus();
  };

  const deleteSaved = (id: string) => {
    removeSavedLogin(id);
    refreshSaved();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-[#243044] dark:to-[#1a2030]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BrandLogo className="mx-auto h-28 w-auto max-w-[14rem] rounded-2xl" />
          <p className="mt-3 text-sm text-slate-500">{t("tagline")}</p>
        </div>

        <h2 className="mb-4 text-lg font-semibold">{t("connexions.title")}</h2>

        {saved.length > 0 ? (
          <div className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {t("connexions.savedTitle")}
            </p>
            <ul className="space-y-2">
              {saved.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => pickSaved(entry)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/60 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/50 dark:hover:border-brand-500"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {entry.identifiant}
                      </span>
                      <span className="text-xs text-slate-500">
                        {t("connexions.savedTap")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    title={t("connexions.savedRemove")}
                    aria-label={t("connexions.savedRemove")}
                    onClick={() => deleteSaved(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <Label htmlFor="identifiant">{t("connexions.identifiant")}</Label>
            <Input
              id="identifiant"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <Label htmlFor="password">{t("connexions.password")}</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("loading") : t("connexions.submit")}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          {t("connexions.hint")}
        </p>
        {!isDesktopApp() ? (
          <p className="mt-2 text-center text-xs">
            <Link to="/telecharger" className="text-brand-700 hover:underline">
              {t("connexions.installHint")}
            </Link>
          </p>
        ) : null}
        {WEBSITE_URL ? (
          <p className="mt-2 text-center text-xs">
            <a
              href={WEBSITE_URL}
              className="text-slate-500 hover:text-brand-700 hover:underline"
            >
              Retour au site EduFaso
            </a>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
