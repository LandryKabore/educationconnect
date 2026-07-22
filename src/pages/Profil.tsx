import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  GENDER_OPTIONS,
  PROFILE_FIELDS_BY_ROLE,
  getProfileFieldValue,
  type ProfileFieldKey,
} from "@/lib/profileCompletion";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SaveButton, isFormDirty } from "@/components/SaveButton";
import {
  Card,
  DateInputFr,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";
import { fromAuthEmail, fullName } from "@/lib/utils";

export default function Profil() {
  const { t } = useTranslation();
  const { profile, role, realRole, refreshProfile } = useAuth();
  const effectiveRole = role ?? realRole;
  const fieldDefs = useMemo(() => {
    if (effectiveRole && PROFILE_FIELDS_BY_ROLE[effectiveRole]) {
      return PROFILE_FIELDS_BY_ROLE[effectiveRole]!;
    }
    return [
      {
        key: "first_name" as const,
        label: "Prénom",
        required: true,
        type: "text" as const,
      },
      {
        key: "last_name" as const,
        label: "Nom",
        required: true,
        type: "text" as const,
      },
      {
        key: "phone" as const,
        label: "Téléphone",
        required: false,
        type: "tel" as const,
      },
    ];
  }, [effectiveRole]);

  const [values, setValues] = useState<Partial<Record<ProfileFieldKey, string>>>(
    {},
  );
  const [saving, setSaving] = useState(false);

  const baseline = useMemo(() => {
    if (!profile) return {} as Partial<Record<ProfileFieldKey, string>>;
    const next: Partial<Record<ProfileFieldKey, string>> = {};
    for (const f of fieldDefs) {
      next[f.key] = getProfileFieldValue(profile, f.key);
    }
    return next;
  }, [profile, fieldDefs]);

  useEffect(() => {
    setValues(baseline);
  }, [baseline]);

  const dirty = isFormDirty(values, baseline);

  const setField = (key: ProfileFieldKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !dirty) return;

    for (const f of fieldDefs) {
      if (f.required && !values[f.key]?.trim()) {
        toast.error(`Le champ « ${f.label} » est obligatoire`);
        return;
      }
    }

    setSaving(true);
    const payload: Record<string, string | null> = {};
    for (const f of fieldDefs) {
      const raw = values[f.key]?.trim() ?? "";
      payload[f.key] = raw || null;
    }

    const { error } = await supabase
      .from("profils")
      .update(payload)
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(t("errors.generic"));
      return;
    }
    await refreshProfile();
    toast.success("Profil enregistré");
  };

  return (
    <div>
      <PageHeader title={t("profile")} subtitle="Informations personnelles" />

      <Card className="mb-6 max-w-lg">
        {profile ? (
          <ProfileAvatar
            userId={profile.id}
            avatarUrl={profile.avatar_url}
            name={fullName(profile.first_name, profile.last_name)}
            editable
            size="lg"
            onChanged={() => void refreshProfile()}
          />
        ) : null}
      </Card>

      <Card className="max-w-lg">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div>
            <Label>Identifiant</Label>
            <Input
              value={fromAuthEmail(profile?.email)}
              disabled
              className="bg-slate-50"
            />
          </div>
          {fieldDefs.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`profil-${f.key}`}>
                {f.label}
                {f.required ? <span className="text-red-600"> *</span> : null}
              </Label>
              {f.type === "date" ? (
                <DateInputFr
                  id={`profil-${f.key}`}
                  value={values[f.key] ?? ""}
                  onChange={(iso) => setField(f.key, iso)}
                  required={f.required}
                  minYear={new Date().getFullYear() - 100}
                  maxYear={new Date().getFullYear()}
                />
              ) : f.type === "gender" ? (
                <Select
                  id={`profil-${f.key}`}
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
                  id={`profil-${f.key}`}
                  type={f.type === "tel" ? "tel" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  required={f.required}
                />
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <SaveButton saving={saving} dirty={dirty} />
            {dirty ? (
              <span className="text-sm text-amber-700">
                Modifications non enregistrées
              </span>
            ) : (
              <span className="text-sm text-slate-500">Aucune modification</span>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
