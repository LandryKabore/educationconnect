import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { needsProfileCompletion } from "@/lib/profileCompletion";
import { WEBSITE_URL } from "@/lib/config";
import { canShowInstallLinks } from "@/lib/platform";
import { useNativeBack } from "@/lib/nativeBack";
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
import { Modal } from "@/components/Modal";
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
  const [toDelete, setToDelete] = useState<SavedLogin | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    identifiant?: string;
    password?: string;
  }>({});
  const [loginError, setLoginError] = useState<string | null>(null);
  const effectiveRole = role ?? realRole;

  useEffect(() => {
    setSaved(listSavedLogins());
  }, []);

  // Android back button dismisses the "save this login?" prompt (same as « Non, merci »)
  useNativeBack(() => {
    setPendingSave(null);
    navigate("/");
  }, pendingSave !== null);

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
    setLoginError(null);
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
      // Stays on screen (a toast alone vanishes after a few seconds)
      setLoginError(t("connexions.error"));
      toast.error(t("connexions.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Own validation: the browser's native bubble is not translated on Android.
    const errors: { identifiant?: string; password?: string } = {};
    if (!identifiant.trim()) errors.identifiant = t("connexions.identifiantRequired");
    if (!password) errors.password = t("connexions.passwordRequired");
    setFieldErrors(errors);
    if (errors.identifiant || errors.password) {
      document.getElementById(errors.identifiant ? "identifiant" : "password")?.focus();
      return;
    }
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

  const confirmDeleteSaved = () => {
    if (!toDelete) return;
    removeSavedLogin(toDelete.id);
    refreshSaved();
    setToDelete(null);
    toast.success(t("connexions.savedRemoved"));
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[2fr_1fr]">
      <div className="relative flex items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] dark:from-[#243044] dark:to-[#1a2030]">
        <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]">
          <ThemeToggle className="min-h-11 min-w-11 justify-center" />
        </div>
        <Card className="w-full max-w-sm border-t-4 border-t-navy-700 p-6 shadow-xl sm:p-8">
          <div className="mb-6 text-center">
            <BrandLogo
              file="edufaso-logo-tight.png"
              className="mx-auto h-32 w-auto max-w-[12rem]"
            />
            <h1 className="sr-only">{t("connexions.title")}</h1>
            <p className="mt-2 text-sm text-slate-600">{t("tagline")}</p>
          </div>

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
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                      title={t("connexions.savedRemove")}
                      aria-label={t("connexions.savedRemove")}
                      onClick={() => setToDelete(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="identifiant" className="font-semibold text-slate-900">
                {t("connexions.identifiant")}
              </Label>
              <Input
                id="identifiant"
                value={identifiant}
                onChange={(e) => {
                  setIdentifiant(e.target.value);
                  if (fieldErrors.identifiant) setFieldErrors((f) => ({ ...f, identifiant: undefined }));
                }}
                placeholder={t("connexions.identifiantPlaceholder")}
                autoComplete="username"
                className="h-12 border-slate-400 focus:border-navy-700 focus:ring-navy-700/20"
                aria-invalid={fieldErrors.identifiant ? true : undefined}
                aria-describedby={fieldErrors.identifiant ? "identifiant-error" : undefined}
              />
              {fieldErrors.identifiant ? (
                <p id="identifiant-error" role="alert" className="mt-1 text-sm font-medium text-rose-700 dark:text-rose-300">
                  {fieldErrors.identifiant}
                </p>
              ) : null}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="password"
                  className="mb-0 font-semibold text-slate-900"
                >
                  {t("connexions.password")}
                </Label>
                <Link
                  to="/mot-de-passe-oublie"
                  className="text-sm font-semibold text-navy-700! underline! hover:text-navy-800! dark:text-slate-100!"
                >
                  {t("connexions.forgotPassword")}
                </Link>
              </div>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                }}
                autoComplete="current-password"
                className="h-12 border-slate-400 focus:border-navy-700 focus:ring-navy-700/20"
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
              />
              {fieldErrors.password ? (
                <p id="password-error" role="alert" className="mt-1 text-sm font-medium text-rose-700 dark:text-rose-300">
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>
            {loginError ? (
              <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {loginError}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="w-full bg-navy-700 font-bold! hover:bg-navy-800"
              disabled={submitting}
            >
              {submitting ? t("loading") : t("connexions.submit")}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            {t("connexions.hint")}
            {canShowInstallLinks() ? (
              <>
                {" "}
                <Link
                  to="/telecharger"
                  className="font-semibold text-navy-700! underline! hover:text-navy-800! dark:text-slate-100!"
                >
                  {t("connexions.installLink")}
                </Link>
              </>
            ) : null}
          </p>
          {WEBSITE_URL ? (
            <p className="mt-2 text-center text-xs">
              <a
                href={WEBSITE_URL}
                className="text-slate-500 hover:text-navy-700 hover:underline"
              >
                Retour au site EduFaso
              </a>
            </p>
          ) : null}
        </Card>
      </div>

      <aside className="flex items-center bg-navy-700 px-8 py-12 text-white sm:px-12 lg:px-14">
        <div className="max-w-sm">
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">
            {t("connexions.panelTitle")}
          </h2>
          <p className="mt-4 text-sm text-slate-200 sm:text-base">
            {t("connexions.panelBody")}
          </p>
          <div className="mt-6 flex gap-2" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-faso-red" />
            <span className="h-1.5 w-10 rounded-full bg-faso-yellow" />
            <span className="h-1.5 w-10 rounded-full bg-faso-green" />
          </div>
        </div>
      </aside>

      <Modal
        open={toDelete !== null}
        title={t("connexions.savedRemoveTitle")}
        onClose={() => setToDelete(null)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t("connexions.savedRemoveBody", {
            identifiant: toDelete?.identifiant ?? "",
          })}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            variant="danger"
            className="min-h-11 flex-1"
            onClick={confirmDeleteSaved}
          >
            {t("connexions.savedRemoveYes")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={() => setToDelete(null)}
          >
            {t("connexions.savedRemoveNo")}
          </Button>
        </div>
      </Modal>

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
