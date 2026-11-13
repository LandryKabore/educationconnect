import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BookOpen, CalendarCheck, ClipboardList, MessageSquare, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
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

  const linkCls = "font-semibold text-brand-700! hover:text-brand-800! hover:underline! dark:text-brand-300!";

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-12 dark:bg-[var(--bg)]">
      {/* ── Brand panel: same teal gradient as the portal banners ── */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white lg:col-span-7 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16">
          <div className="inline-flex w-fit rounded-lg bg-white px-3 py-2 shadow-lg shadow-brand-900/30">
            <BrandLogo file="edufaso-logo-tight.png" className="h-12 w-auto max-w-[9rem]" imgClassName="h-12" />
          </div>
          <div className="my-auto max-w-xl py-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{t("tagline")}</p>
            <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight xl:text-[2.75rem]">
              {t("connexions.panelTitle")}
            </h2>
            <p className="mt-4 text-base font-medium text-white/85">{t("connexions.panelBody")}</p>
            <ul className="mt-10 grid grid-cols-2 gap-3">
              {[
                { icon: BookOpen, title: "Notes et bulletins", body: "Moyennes, rang et bulletin PDF" },
                { icon: CalendarCheck, title: "Présences", body: "Absences et retards en direct" },
                { icon: ClipboardList, title: "Devoirs", body: "Exercices et compositions à venir" },
                { icon: MessageSquare, title: "Messages", body: "École, professeurs et familles" },
              ].map((f) => (
                <li key={f.title} className="flex gap-3 rounded-md bg-white/10 p-4 ring-1 ring-white/15">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-white/90" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{f.title}</span>
                    <span className="mt-0.5 block text-xs text-white/75">{f.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/60">EduFaso · Burkina Faso</p>
        </div>
        <div className="relative flex h-1.5" aria-hidden>
          <span className="flex-1 bg-faso-red" />
          <span className="flex-1 bg-faso-yellow" />
          <span className="flex-1 bg-faso-green" />
        </div>
      </aside>

      {/* ── Form ── */}
      <main className="relative flex flex-col lg:col-span-5">
        {/* small screens: compact teal header instead of the panel */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-6 pb-6 pt-8 text-white lg:hidden">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/[0.06]" />
          <div className="relative inline-flex rounded-lg bg-white px-2.5 py-1.5">
            <BrandLogo file="edufaso-logo-tight.png" className="h-9 w-auto max-w-[7rem]" imgClassName="h-9" />
          </div>
          <p className="relative mt-4 text-lg font-bold leading-snug">{t("connexions.panelTitle")}</p>
        </div>
        <div className="absolute right-4 top-4 z-10 hidden lg:block">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {t("connexions.title")}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">Utilisez l’identifiant fourni par votre établissement.</p>

            {saved.length > 0 ? (
              <div className="mt-7">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t("connexions.savedTitle")}
                </p>
                <ul className="space-y-2">
                  {saved.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => pickSaved(entry)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50/60 disabled:opacity-60 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:hover:border-brand-500"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900/50 dark:text-brand-200">
                          {entry.identifiant.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {entry.identifiant}
                          </span>
                          <span className="text-xs text-slate-500">
                            {getSavedPassword(entry) ? t("connexions.savedTapLogin") : t("connexions.savedTap")}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        title={t("connexions.savedRemove")}
                        aria-label={t("connexions.savedRemove")}
                        onClick={() => deleteSaved(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="my-6 flex items-center gap-3 text-xs font-medium text-slate-400">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-[var(--border)]" />
                  ou avec un autre compte
                  <span className="h-px flex-1 bg-slate-200 dark:bg-[var(--border)]" />
                </div>
              </div>
            ) : (
              <div className="h-7" />
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <Label htmlFor="identifiant" className="font-semibold text-slate-900">
                  {t("connexions.identifiant")}
                </Label>
                <Input
                  id="identifiant"
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value)}
                  placeholder={t("connexions.identifiantPlaceholder")}
                  autoComplete="username"
                  className="h-12 rounded-md border-slate-300 focus:border-brand-600 focus:ring-brand-600/20"
                  required
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label htmlFor="password" className="mb-0 font-semibold text-slate-900">
                    {t("connexions.password")}
                  </Label>
                  <Link to="/mot-de-passe-oublie" className={cn("text-sm", linkCls)}>
                    {t("connexions.forgotPassword")}
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-12 rounded-md border-slate-300 focus:border-brand-600 focus:ring-brand-600/20"
                  required
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-md bg-brand-700 font-bold! hover:bg-brand-800"
                disabled={submitting}
              >
                {submitting ? t("loading") : t("connexions.submit")}
              </Button>
            </form>

            <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-[var(--border)]">
              <p>
                {t("connexions.hint")}
                {!isDesktopApp() ? (
                  <>
                    {" "}
                    <Link to="/telecharger" className={linkCls}>
                      {t("connexions.installLink")}
                    </Link>
                  </>
                ) : null}
              </p>
              {WEBSITE_URL ? (
                <p className="mt-2 text-xs">
                  <a href={WEBSITE_URL} className="text-slate-500 hover:text-brand-700 hover:underline">
                    Retour au site EduFaso
                  </a>
                </p>
              ) : null}
            </div>
            <div className="mt-6 lg:hidden">
              <ThemeToggle className="w-full justify-center" />
            </div>
          </div>
        </div>
      </main>

      {pendingSave ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-login-title"
        >
          <Card className="w-full max-w-sm rounded-lg shadow-xl">
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
