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
  findSavedLogin,
  getSavedPassword,
  listSavedLogins,
  removeSavedLogin,
  saveLogin,
  type SavedLogin,
} from "@/lib/savedLogins";
import { BrandLogo } from "@/components/BrandLogo";
import { Button, Card, Input, Label, PasswordInput } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

type PendingSave = {
  identifiant: string;
  password: string;
};

export default function Connexion() {
  const { t } = useTranslation();
  const { signIn, session, profile, role, realRole, homePath, loading } =
    useAuth();
  const navigate = useNavigate();
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<SavedLogin[]>([]);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const effectiveRole = role ?? realRole;

  useEffect(() => {
    setSaved(listSavedLogins());
  }, []);

  if (!loading && session && !pendingSave) {
    if (profile?.must_change_password) {
      return <Navigate to="/premiere-connexion" replace />;
    }
    if (needsProfileCompletion(profile, effectiveRole)) {
      return <Navigate to="/completer-profil" replace />;
    }
    return <Navigate to={homePath} replace />;
  }

  const refreshSaved = () => setSaved(listSavedLogins());

  const finishAndGo = () => {
    setPendingSave(null);
    navigate("/");
  };

  const attemptSignIn = async (id: string, pwd: string) => {
    setSubmitting(true);
    try {
      await signIn(id, pwd);
      const already = findSavedLogin(id);
      if (already) {
        saveLogin(id, pwd);
        refreshSaved();
        navigate("/");
      } else {
        setPendingSave({
          identifiant: id.trim(),
          password: pwd,
        });
      }
    } catch {
      toast.error(t("connexions.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await attemptSignIn(identifiant, password);
  };

  const acceptSave = () => {
    if (!pendingSave) return;
    saveLogin(pendingSave.identifiant, pendingSave.password);
    refreshSaved();
    toast.success(t("connexions.savedOk"));
    finishAndGo();
  };

  const declineSave = () => {
    finishAndGo();
  };

  const pickSaved = (entry: SavedLogin) => {
    const pwd = getSavedPassword(entry);
    setIdentifiant(entry.identifiant);
    setPassword(pwd);
    if (pwd) {
      void attemptSignIn(entry.identifiant, pwd);
    }
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
                        {getSavedPassword(entry)
                          ? t("connexions.savedTapLogin")
                          : t("connexions.savedTap")}
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

      {pendingSave ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-login-title"
        >
          <Card className="w-full max-w-sm shadow-xl">
            <h3
              id="save-login-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {t("connexions.savePromptTitle")}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t("connexions.savePromptBody", {
                identifiant: pendingSave.identifiant,
              })}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t("connexions.savePromptHint")}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <Button type="button" className="flex-1" onClick={acceptSave}>
                {t("connexions.saveYes")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={declineSave}
              >
                {t("connexions.saveNo")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
