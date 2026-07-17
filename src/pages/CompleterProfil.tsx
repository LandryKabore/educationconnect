import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  GENDER_OPTIONS,
  getProfileFieldValue,
  getProfileFieldsToPrompt,
  needsProfileCompletion,
  type ProfileFieldKey,
} from "@/lib/profileCompletion";
import {
  Button,
  Card,
  DateInputFr,
  Input,
  Label,
  Select,
} from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { fullName } from "@/lib/utils";

export default function CompleterProfil() {
  const {
    session,
    profile,
    role,
    realRole,
    homePath,
    loading,
    refreshProfile,
  } = useAuth();
  const navigate = useNavigate();
  const effectiveRole = role ?? realRole;

  const fields = useMemo(
    () => getProfileFieldsToPrompt(profile, effectiveRole),
    [profile, effectiveRole],
  );

  const [values, setValues] = useState<Partial<Record<ProfileFieldKey, string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const next: Partial<Record<ProfileFieldKey, string>> = {};
    for (const f of fields) {
      next[f.key] = getProfileFieldValue(profile, f.key);
    }
    setValues(next);
  }, [profile, fields]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/connexion" replace />;
  }

  if (profile?.must_change_password) {
    return <Navigate to="/premiere-connexion" replace />;
  }

  if (!needsProfileCompletion(profile, effectiveRole)) {
    return <Navigate to={homePath} replace />;
  }

  const setField = (key: ProfileFieldKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    for (const f of fields) {
      if (!f.required) continue;
      if (!values[f.key]?.trim()) {
        toast.error(`Le champ « ${f.label} » est obligatoire`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, string | null> = {};
      for (const f of fields) {
        const raw = values[f.key]?.trim() ?? "";
        payload[f.key] = raw || null;
      }

      const { error } = await supabase
        .from("profils")
        .update(payload)
        .eq("id", profile.id);
      if (error) throw error;

      await refreshProfile();
      toast.success("Profil complété");
      navigate(homePath, { replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Impossible d’enregistrer le profil",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = fullName(profile?.first_name, profile?.last_name);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4 dark:from-[#243044] dark:to-[#1a2030]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg">
        <h1 className="text-xl font-bold text-slate-900">
          Complétez votre profil
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Première connexion : renseignez les informations manquantes pour
          continuer.
        </p>

        {profile ? (
          <div className="mt-5">
            <ProfileAvatar
              userId={profile.id}
              avatarUrl={profile.avatar_url}
              name={displayName}
              editable
              size="lg"
              invalidateKeys={[]}
              onChanged={() => void refreshProfile()}
            />
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key}>
                {f.label}
                {f.required ? (
                  <span className="text-red-600"> *</span>
                ) : (
                  <span className="font-normal text-slate-400"> (optionnel)</span>
                )}
              </Label>
              {f.type === "date" ? (
                <DateInputFr
                  id={f.key}
                  value={values[f.key] ?? ""}
                  onChange={(iso) => setField(f.key, iso)}
                  required={f.required}
                />
              ) : f.type === "gender" ? (
                <Select
                  id={f.key}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  required={f.required}
                >
                  <option value="">Choisir…</option>
                  {GENDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={f.key}
                  type={f.type === "tel" ? "tel" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  required={f.required}
                  autoComplete={
                    f.key === "first_name"
                      ? "given-name"
                      : f.key === "last_name"
                        ? "family-name"
                        : f.key === "phone"
                          ? "tel"
                          : f.key === "address"
                            ? "street-address"
                            : "off"
                  }
                />
              )}
            </div>
          ))}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Enregistrement…" : "Enregistrer et continuer"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
