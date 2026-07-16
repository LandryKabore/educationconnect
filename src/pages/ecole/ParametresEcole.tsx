import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SchoolFieldsForm } from "@/components/SchoolFieldsForm";
import {
  emptySchoolForm,
  formToSchoolPayload,
  isSchoolFormComplete,
  schoolToForm,
  type SchoolFormFields,
} from "@/lib/schoolForm";
import { supabase } from "@/lib/supabase";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";

function formSnapshot(form: SchoolFormFields) {
  return JSON.stringify(formToSchoolPayload(form));
}

export default function ParametresEcole() {
  const { schoolId, schools, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const school = schools.find((s) => s.id === schoolId);
  const [form, setForm] = useState<SchoolFormFields>(emptySchoolForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (school) setForm(schoolToForm(school));
  }, [school]);

  const savedSnapshot = useMemo(
    () => (school ? formSnapshot(schoolToForm(school)) : ""),
    [school],
  );
  const isUpToDate = formSnapshot(form) === savedSnapshot;
  const canSave = isSchoolFormComplete(form) && !isUpToDate;

  if (!schoolId || !school) {
    return <EmptyState message="Aucune école associée à votre compte." />;
  }

  const onChange = (key: keyof SchoolFormFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUpToDate) return;
    if (!isSchoolFormComplete(form)) {
      toast.error("Remplissez tous les champs obligatoires");
      return;
    }
    setSaving(true);
    const payload = formToSchoolPayload(form);
    const { error } = await supabase
      .from("ecoles")
      .update(payload)
      .eq("id", schoolId);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Impossible d’enregistrer");
      return;
    }
    toast.success("Profil de l’école mis à jour");
    await refreshProfile();
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Paramètres de l’école"
        subtitle="Informations visibles pour votre établissement"
      />

      <Card className="max-w-2xl">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
          <SchoolFieldsForm form={form} onChange={onChange} idPrefix="ecole-settings" />
          <div className="flex flex-wrap items-center gap-3">
            {isUpToDate ? (
              <Button
                type="button"
                variant="outline"
                disabled
                className="border-emerald-200 bg-emerald-50 text-emerald-800 disabled:opacity-100"
              >
                <Check className="h-4 w-4" />
                À jour
              </Button>
            ) : (
              <Button type="submit" disabled={saving || !canSave}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            )}
            {!isUpToDate ? (
              <span className="text-sm text-amber-700">Modifications non enregistrées</span>
            ) : (
              <span className="text-sm text-slate-500">Aucune modification</span>
            )}
          </div>
        </form>
      </Card>

      {(school.plan || school.billing_status) && (
        <Card className="mt-6 max-w-2xl">
          <h3 className="font-semibold text-slate-900">Abonnement</h3>
          <p className="mt-1 text-sm text-slate-600">
            Plan : {school.plan ?? "—"} · Statut : {school.billing_status ?? "—"}
            {school.subscription_ends_at
              ? ` · Fin : ${new Date(school.subscription_ends_at).toLocaleDateString("fr-FR")}`
              : ""}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            La gestion de l’abonnement est effectuée par EduFaso. Contactez le support pour toute
            modification.
          </p>
        </Card>
      )}
    </div>
  );
}
