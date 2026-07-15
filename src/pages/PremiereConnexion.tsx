import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Input, Label } from "@/components/ui";

export default function PremiereConnexion() {
  const { t } = useTranslation();
  const { session, profile, completePasswordChange, homePath, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !session) {
    return <Navigate to="/connexion" replace />;
  }

  if (!loading && session && !profile?.must_change_password) {
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("premiere.tooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("premiere.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordChange(password);
      toast.success("Mot de passe mis à jour");
      navigate(homePath);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-bold text-slate-900">{t("premiere.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("premiere.subtitle")}</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="newPassword">{t("premiere.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="confirm">{t("premiere.confirm")}</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("loading") : t("premiere.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
