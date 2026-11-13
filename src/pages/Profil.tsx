import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, CheckCircle2, GraduationCap, School } from "lucide-react";
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
import { SaveButton } from "@/components/SaveButton";
import { isFormDirty } from "@/lib/formDirty";
import {
  Card,
  DateInputFr,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";
import { cn, fromAuthEmail, fullName } from "@/lib/utils";

export default function Profil() {
  const { t } = useTranslation();
  const { user, profile, role, realRole, refreshProfile, schools, schoolId } = useAuth();
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

  // same key and shape as the bulletin page, so the class comes from cache
  const isStudent = effectiveRole === "student";
  const { data: enrollment } = useQuery({
    queryKey: ["mon-inscription-bulletin", user?.id],
    enabled: isStudent && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inscriptions")
        .select("class_section_id, classes(name)")
        .eq("student_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      return data as { class_section_id: string; classes: { name: string } | null } | null;
    },
  });

  const renderField = (f: (typeof fieldDefs)[number]) => (
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
  );

  if (isStudent) {
    const name = profile ? fullName(profile.first_name, profile.last_name) : "";
    const schoolName = schools.find((sc) => sc.id === schoolId)?.name ?? schools[0]?.name;
    const className = enrollment?.classes?.name;
    const filled = fieldDefs.filter((f) => !!baseline[f.key]?.trim()).length + (profile?.avatar_url ? 1 : 0);
    const total = fieldDefs.length + 1;
    const pct = Math.round((filled / total) * 100);
    const missing = [
      ...fieldDefs.filter((f) => !baseline[f.key]?.trim()).map((f) => f.label),
      ...(profile?.avatar_url ? [] : ["Photo"]),
    ];
    return (
      // squarer corners on this page only
      <div className="space-y-6 [&_.rounded-2xl]:rounded-lg [&_.rounded-3xl]:rounded-lg [&_.rounded-xl]:rounded-md">
        <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white shadow-lg shadow-brand-900/25">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.04]" />
          <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:p-8">
            <div className="flex items-center gap-5 lg:col-span-7">
              {profile ? (
                <ProfileAvatar
                  userId={profile.id}
                  avatarUrl={profile.avatar_url}
                  name={name}
                  editable
                  layout="badge"
                  circleClassName="h-24 w-24 rounded-lg border-2 border-white/40 bg-white/15 text-3xl lg:h-28 lg:w-28"
                  onChanged={() => void refreshProfile()}
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Mon profil</p>
                <h1 className="mt-1.5 truncate text-3xl font-bold tracking-tight lg:text-[2rem]">{name || "—"}</h1>
                <p className="mt-1.5 truncate text-sm font-medium text-white/85">
                  {["Élève", className ? `Classe ${className}` : null, schoolName].filter(Boolean).join(" · ")}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15">
                  <AtSign className="h-3 w-3" />
                  {fromAuthEmail(profile?.email)}
                </span>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Profil complété</span>
                  <span className={cn("text-2xl font-bold tabular-nums", pct === 100 ? "text-emerald-600" : "text-slate-900")}>
                    {pct} %
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-100">
                  <div
                    className={cn("h-full rounded-sm", pct === 100 ? "bg-emerald-500" : "bg-brand-600")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  {missing.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Tout est à jour.
                    </span>
                  ) : (
                    <>À compléter : {missing.join(", ")}</>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex h-1" aria-hidden>
            <span className="flex-1 bg-faso-red" />
            <span className="flex-1 bg-faso-yellow" />
            <span className="flex-1 bg-faso-green" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-8">
            <form onSubmit={(e) => void handleSave(e)}>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Informations personnelles</h2>
              <p className="mt-0.5 text-sm text-slate-500">Elles apparaissent sur ton bulletin et pour l’école.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">{fieldDefs.map(renderField)}</div>
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
                <SaveButton saving={saving} dirty={dirty} />
                {dirty ? (
                  <span className="text-sm text-amber-700">Modifications non enregistrées</span>
                ) : (
                  <span className="text-sm text-slate-500">Aucune modification</span>
                )}
              </div>
            </form>
          </Card>

          <div className="space-y-6 lg:col-span-4">
            <Card>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Photo de profil</h2>
              <p className="mb-4 mt-0.5 text-sm text-slate-500">Visible par tes professeurs et l’école.</p>
              {profile ? (
                <ProfileAvatar
                  userId={profile.id}
                  avatarUrl={profile.avatar_url}
                  name={name}
                  editable
                  size="md"
                  circleClassName="rounded-md"
                  onChanged={() => void refreshProfile()}
                />
              ) : null}
            </Card>
            <Card>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Mon compte</h2>
              <dl className="mt-3 divide-y divide-slate-100 text-sm dark:divide-[var(--border)]">
                {[
                  { icon: AtSign, label: "Identifiant", value: fromAuthEmail(profile?.email) },
                  { icon: GraduationCap, label: "Classe", value: className ?? "—" },
                  { icon: School, label: "École", value: schoolName ?? "—" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 py-2.5">
                    <row.icon className="h-4 w-4 shrink-0 text-slate-400" />
                    <dt className="w-24 shrink-0 text-slate-500">{row.label}</dt>
                    <dd className="min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      </div>
    );
  }

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
