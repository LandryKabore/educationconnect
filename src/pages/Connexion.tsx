import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { WEBSITE_URL } from "@/lib/config";
import { isDesktopApp } from "@/lib/platform";
import { Button, Card, Input, Label, PasswordInput } from "@/components/ui";

export default function Connexion() {
  const { t } = useTranslation();
  const { signIn, session, profile, homePath, loading } = useAuth();
  const navigate = useNavigate();
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    if (profile?.must_change_password) {
      return <Navigate to="/premiere-connexion" replace />;
    }
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(identifiant, password);
      navigate("/");
    } catch {
      toast.error(t("connexions.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-700">EduFaso</h1>
          <p className="mt-1 text-sm text-slate-500">{t("tagline")}</p>
        </div>

        <h2 className="mb-4 text-lg font-semibold">{t("connexions.title")}</h2>

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
