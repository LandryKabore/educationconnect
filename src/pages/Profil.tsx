import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui";
import { fromAuthEmail } from "@/lib/utils";

export default function Profil() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name);
      setLastName(profile.last_name);
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profils")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
      })
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
          <div>
            <Label htmlFor="firstName">Prénom</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="lastName">Nom</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? t("loading") : t("save")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
