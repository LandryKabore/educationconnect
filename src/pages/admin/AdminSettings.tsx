import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import type { PlatformSettings } from "@/lib/types";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";

export default function AdminSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    invite_site_url: "",
    app_name: "",
    support_email: "",
    default_year_label: "",
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

  useEffect(() => {
    if (!settings) return;
    setForm({
      invite_site_url: settings.invite_site_url ?? "",
      app_name: settings.app_name ?? "",
      support_email: settings.support_email ?? "",
      default_year_label: settings.default_year_label ?? "",
    });
  }, [settings]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.invite_site_url.trim() || !form.app_name.trim()) {
      toast.error("URL d'invitation et nom de l'application sont obligatoires");
      return;
    }

    setSaving(true);
    const payload = {
      invite_site_url: form.invite_site_url.trim(),
      app_name: form.app_name.trim(),
      support_email: form.support_email.trim() || null,
      default_year_label: form.default_year_label.trim() || null,
      updated_at: new Date().toISOString(),
    };

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
            <Label htmlFor="default_year_label">Libellé d'année scolaire par défaut</Label>
            <Input
              id="default_year_label"
              value={form.default_year_label}
              onChange={(e) => setField("default_year_label", e.target.value)}
              placeholder="2025-2026"
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
