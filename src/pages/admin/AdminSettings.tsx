import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { isHttpUrl, isValidAppVersion } from "@/lib/appVersion";
import type { PlatformSettings } from "@/lib/types";
import { SaveButton, isFormDirty } from "@/components/SaveButton";
import { Card, Input, Label, PageHeader } from "@/components/ui";

type SettingsForm = {
  invite_site_url: string;
  app_name: string;
  support_email: string;
  default_year_label: string;
  latest_version_bureau: string;
  latest_version_android: string;
  min_supported_version: string;
  download_url_bureau: string;
  download_url_android: string;
};

const VERSION_FIELDS = [
  "latest_version_bureau",
  "latest_version_android",
  "min_supported_version",
  "download_url_bureau",
  "download_url_android",
] as const satisfies readonly (keyof SettingsForm)[];

function toForm(settings: PlatformSettings): SettingsForm {
  return {
    invite_site_url: settings.invite_site_url ?? "",
    app_name: settings.app_name ?? "",
    support_email: settings.support_email ?? "",
    default_year_label: settings.default_year_label ?? "",
    latest_version_bureau: settings.latest_version_bureau ?? "",
    latest_version_android: settings.latest_version_android ?? "",
    min_supported_version: settings.min_supported_version ?? "",
    download_url_bureau: settings.download_url_bureau ?? "",
    download_url_android: settings.download_url_android ?? "",
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function versionFieldError(label: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isValidAppVersion(trimmed)) {
    return `${label} : utilisez un numéro comme 1.0.2`;
  }
  return null;
}

function urlFieldError(label: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isHttpUrl(trimmed)) {
    return `${label} : indiquez une adresse http ou https`;
  }
  return null;
}

export default function AdminSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<SettingsForm>({
    invite_site_url: "",
    app_name: "",
    support_email: "",
    default_year_label: "",
    latest_version_bureau: "",
    latest_version_android: "",
    min_supported_version: "",
    download_url_bureau: "",
    download_url_android: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as PlatformSettings;
    },
  });

  const baseline = useMemo(
    () => (settings ? toForm(settings) : null),
    [settings],
  );

  useEffect(() => {
    if (baseline) setForm(baseline);
  }, [baseline]);

  const dirty = baseline ? isFormDirty(form, baseline) : false;

  const setField = (key: keyof SettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    if (!form.invite_site_url.trim() || !form.app_name.trim()) {
      toast.error("URL d'invitation et nom de l'application sont obligatoires");
      return;
    }
    const fieldError =
      versionFieldError("Version bureau", form.latest_version_bureau) ||
      versionFieldError("Version Android", form.latest_version_android) ||
      versionFieldError("Version minimale", form.min_supported_version) ||
      urlFieldError("Lien bureau", form.download_url_bureau) ||
      urlFieldError("Lien Android", form.download_url_android);
    if (fieldError) {
      toast.error(fieldError);
      return;
    }
    if (form.latest_version_bureau.trim() && !form.download_url_bureau.trim()) {
      toast.error("Indiquez le lien de téléchargement pour le bureau");
      return;
    }
    if (form.download_url_bureau.trim() && !form.latest_version_bureau.trim()) {
      toast.error("Indiquez la dernière version bureau");
      return;
    }
    if (form.latest_version_android.trim() && !form.download_url_android.trim()) {
      toast.error("Indiquez le lien de téléchargement pour Android");
      return;
    }
    if (form.download_url_android.trim() && !form.latest_version_android.trim()) {
      toast.error("Indiquez la dernière version Android");
      return;
    }
    if (
      form.min_supported_version.trim() &&
      !form.download_url_bureau.trim() &&
      !form.download_url_android.trim()
    ) {
      toast.error("Indiquez au moins un lien de téléchargement avec la version minimale");
      return;
    }

    const versionDirty = baseline
      ? VERSION_FIELDS.some((key) => form[key] !== baseline[key])
      : false;

    setSaving(true);
    const payload: Record<string, unknown> = {
      invite_site_url: form.invite_site_url.trim(),
      app_name: form.app_name.trim(),
      support_email: form.support_email.trim() || null,
      default_year_label: form.default_year_label.trim() || null,
      updated_at: new Date().toISOString(),
    };
    // Omitted until a version field changes, so saving the other settings still
    // works before the version columns exist. Raising the minimum is recorded
    // by trg_platform_settings_audit_min_version (raise_min_supported_version).
    if (versionDirty) {
      payload.latest_version_bureau = blankToNull(form.latest_version_bureau);
      payload.latest_version_android = blankToNull(form.latest_version_android);
      payload.min_supported_version = blankToNull(form.min_supported_version);
      payload.download_url_bureau = blankToNull(form.download_url_bureau);
      payload.download_url_android = blankToNull(form.download_url_android);
    }

    const { error } = await supabase
      .from("platform_settings")
      .update(payload)
      .eq("id", 1);
    setSaving(false);

    if (error) {
      toast.error("Impossible d'enregistrer les paramètres");
      return;
    }

    await logAudit("update_settings", "platform_settings", "1", payload);
    toast.success("Paramètres enregistrés");
    void qc.invalidateQueries({ queryKey: ["platform-settings"] });
  };

  if (isLoading) return <p className="text-slate-500">Chargement…</p>;

  return (
    <div>
      <PageHeader
        title="Paramètres"
        subtitle="Configuration globale de la plateforme EduFaso"
      />

      <Card className="max-w-2xl">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div>
            <Label htmlFor="invite_site_url">URL du site d'invitation</Label>
            <Input
              id="invite_site_url"
              type="url"
              value={form.invite_site_url}
              onChange={(e) => setField("invite_site_url", e.target.value)}
              placeholder="https://edufaso.example.com"
              required
            />
          </div>
          <div>
            <Label htmlFor="app_name">Nom de l'application</Label>
            <Input
              id="app_name"
              value={form.app_name}
              onChange={(e) => setField("app_name", e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="support_email">E-mail de support</Label>
            <Input
              id="support_email"
              type="email"
              value={form.support_email}
              onChange={(e) => setField("support_email", e.target.value)}
              placeholder="support@edufaso.bf"
            />
          </div>
          <div>
            <Label htmlFor="default_year_label">
              Libellé d'année scolaire par défaut
            </Label>
            <Input
              id="default_year_label"
              value={form.default_year_label}
              onChange={(e) => setField("default_year_label", e.target.value)}
              placeholder="2025-2026"
            />
          </div>
          <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Versions installées
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Au démarrage, les applications bureau et Android comparent leur version à ces
                valeurs. Une version plus récente affiche « Une nouvelle version est disponible ».
                Une version plus ancienne que le minimum bloque uniquement la saisie des notes, des
                présences et des messages. Le site et la PWA ne sont pas concernés. Aucune
                installation automatique. Augmenter la version minimale est inscrit dans le journal
                d’audit.
              </p>
            </div>
            <div>
              <Label htmlFor="latest_version_bureau">Dernière version — bureau</Label>
              <Input
                id="latest_version_bureau"
                value={form.latest_version_bureau}
                onChange={(e) => setField("latest_version_bureau", e.target.value)}
                placeholder="1.0.2"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label htmlFor="download_url_bureau">Lien de téléchargement — bureau</Label>
              <Input
                id="download_url_bureau"
                type="url"
                value={form.download_url_bureau}
                onChange={(e) => setField("download_url_bureau", e.target.value)}
                placeholder="https://edufaso.lovable.app/#telecharger"
              />
            </div>
            <div>
              <Label htmlFor="latest_version_android">Dernière version — Android</Label>
              <Input
                id="latest_version_android"
                value={form.latest_version_android}
                onChange={(e) => setField("latest_version_android", e.target.value)}
                placeholder="1.0.2"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label htmlFor="download_url_android">Lien de téléchargement — Android</Label>
              <Input
                id="download_url_android"
                type="url"
                value={form.download_url_android}
                onChange={(e) => setField("download_url_android", e.target.value)}
                placeholder="https://exemple.bf/edufaso.apk"
              />
            </div>
            <div>
              <Label htmlFor="min_supported_version">Version minimale prise en charge</Label>
              <Input
                id="min_supported_version"
                value={form.min_supported_version}
                onChange={(e) => setField("min_supported_version", e.target.value)}
                placeholder="1.0.1"
                inputMode="decimal"
              />
            </div>
          </div>
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
