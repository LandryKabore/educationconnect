import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, CheckCircle2, CreditCard, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SaveButton } from "@/components/SaveButton";
import { isFormDirty } from "@/lib/formDirty";
import {
  emptySchoolForm,
  formToSchoolPayload,
  isSchoolFormComplete,
  SCHOOL_TYPES,
  schoolToForm,
  schoolTypeLabel,
  type SchoolFormFields,
} from "@/lib/schoolForm";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { FamilyAccountsCard } from "@/components/FamilyAccountsCard";
import { Button, Card, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import { PageBanner } from "@/components/PageBanner";

function formSnapshot(form: SchoolFormFields) {
  return formToSchoolPayload(form);
}

/** The eight fields of the school record, grouped the way the page shows them. */
const FIELD_LABELS: Record<keyof SchoolFormFields, string> = {
  name: "Nom",
  code: "Code école",
  schoolType: "Type",
  region: "Région",
  city: "Ville",
  address: "Adresse",
  phone: "Téléphone",
  email: "E-mail",
};
const SECTION_FIELDS = {
  identity: ["name", "code", "schoolType"],
  location: ["region", "city", "address"],
  contact: ["phone", "email"],
} as const satisfies Record<string, readonly (keyof SchoolFormFields)[]>;

/** Billing statuses as stored, in French. Unknown values are shown as they are. */
const BILLING_LABELS: Record<string, string> = {
  trial: "Période d’essai",
  trialing: "Période d’essai",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Annulé",
  cancelled: "Annulé",
  suspended: "Suspendu",
};

function capitalizeFirst(value: string | null | undefined) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    () => (school ? formSnapshot(schoolToForm(school)) : null),
    [school],
  );
  const dirty = savedSnapshot
    ? isFormDirty(formSnapshot(form), savedSnapshot)
    : false;

  if (!schoolId || !school) {
    return <EmptyState message="Aucune école associée à votre compte." />;
  }

  const onChange = (key: keyof SchoolFormFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
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

  // completion follows what is typed, so the meter moves as the form is filled
  const keys = Object.keys(FIELD_LABELS) as (keyof SchoolFormFields)[];
  const missing = keys.filter((k) => !form[k].trim());
  const pct = Math.round(((keys.length - missing.length) / keys.length) * 100);
  const missingIn = (section: keyof typeof SECTION_FIELDS) =>
    SECTION_FIELDS[section].filter((k) => !form[k].trim()).length;

  const id = (name: string) => `ecole-settings-${name}`;
  const required = <span className="text-red-600"> *</span>;

  return (
    <div>
      <SetupGuideBar />
      <PageBanner
        title="Paramètres de l’école"
        subtitle="Ces informations apparaissent sur les bulletins et les documents de l’établissement."
        stats={[
          { label: "Code école", value: school.code || "—" },
          { label: "Type", value: schoolTypeLabel(school.school_type) },
          { label: "Localité", value: school.city || "—", hint: school.region ?? undefined },
        ]}
        aside={
          <div className="rounded-md bg-white p-5 text-slate-900 shadow-xl shadow-brand-900/25">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fiche de l’école</span>
              <span className={cn("text-2xl font-bold tabular-nums", pct === 100 ? "text-emerald-600" : "text-slate-900")}>
                {pct} %
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-100">
              <div
                className={cn("h-full rounded-sm transition-all", pct === 100 ? "bg-emerald-500" : "bg-brand-600")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {missing.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Toutes les informations sont renseignées.
                </span>
              ) : (
                <>
                  À compléter : <span className="font-semibold text-slate-800">{missing.map((k) => FIELD_LABELS[k]).join(", ")}</span>
                </>
              )}
            </p>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* ── The school record, in three sections ── */}
        <Card className="p-0 lg:col-span-8">
          <form onSubmit={(e) => void handleSave(e)}>
            <Section icon={Building2} title="Identité" hint="Le nom et le code figurent sur chaque bulletin." missing={missingIn("identity")}>
              <div className="sm:col-span-2">
                <Label htmlFor={id("name")}>Nom de l’établissement{required}</Label>
                <Input
                  id={id("name")}
                  value={form.name}
                  onChange={(e) => onChange("name", e.target.value)}
                  placeholder="ex. Lycée Privé Saint-Joseph"
                  required
                />
              </div>
              <div>
                <Label htmlFor={id("code")}>Code école{required}</Label>
                <Input
                  id={id("code")}
                  value={form.code}
                  onChange={(e) => onChange("code", e.target.value)}
                  placeholder="ex. LP-SJ-OUA"
                  required
                />
              </div>
              <div>
                <Label htmlFor={id("schoolType")}>Type d’établissement{required}</Label>
                <Select
                  id={id("schoolType")}
                  value={form.schoolType}
                  onChange={(e) => onChange("schoolType", e.target.value)}
                  required
                >
                  <option value="">Sélectionner…</option>
                  {SCHOOL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            </Section>

            <Section icon={MapPin} title="Localisation" hint="Où se trouve l’établissement." missing={missingIn("location")}>
              <div>
                <Label htmlFor={id("region")}>Région / province{required}</Label>
                <Input
                  id={id("region")}
                  value={form.region}
                  onChange={(e) => onChange("region", e.target.value)}
                  placeholder="ex. Centre"
                  required
                />
              </div>
              <div>
                <Label htmlFor={id("city")}>Ville / commune{required}</Label>
                <Input
                  id={id("city")}
                  value={form.city}
                  onChange={(e) => onChange("city", e.target.value)}
                  placeholder="ex. Ouagadougou"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor={id("address")}>Adresse complète{required}</Label>
                <Textarea
                  id={id("address")}
                  rows={2}
                  value={form.address}
                  onChange={(e) => onChange("address", e.target.value)}
                  placeholder="Quartier, rue, repère…"
                  className="min-h-[4.5rem]"
                  required
                />
              </div>
            </Section>

            <Section icon={Phone} title="Contact" hint="Pour que les familles puissent joindre l’école." missing={missingIn("contact")}>
              <div>
                <Label htmlFor={id("phone")}>Téléphone{required}</Label>
                <Input
                  id={id("phone")}
                  type="tel"
                  value={form.phone}
                  onChange={(e) => onChange("phone", e.target.value)}
                  placeholder="ex. +226 70 00 00 00"
                  required
                />
              </div>
              <div>
                <Label htmlFor={id("email")}>E-mail de contact{required}</Label>
                <Input
                  id={id("email")}
                  type="email"
                  value={form.email}
                  onChange={(e) => onChange("email", e.target.value)}
                  placeholder="ex. contact@ecole.bf"
                  required
                />
              </div>
            </Section>

            {/* save bar: stays in view while the form scrolls */}
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-b-lg border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-[var(--border)] dark:bg-[var(--surface)]/95">
              <SaveButton saving={saving} dirty={dirty} disabled={!isSchoolFormComplete(form)} />
              {dirty ? (
                <>
                  <Button type="button" variant="ghost" disabled={saving} onClick={() => setForm(schoolToForm(school))}>
                    Annuler
                  </Button>
                  <span className="text-sm text-amber-700">
                    {isSchoolFormComplete(form)
                      ? "Modifications non enregistrées"
                      : "Complétez les champs marqués * pour enregistrer"}
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-500">Aucune modification</span>
              )}
            </div>
          </form>
        </Card>

        {/* ── Settings beside the record ── */}
        <div className="space-y-6 lg:col-span-4">
          <FamilyAccountsCard schoolId={schoolId} />

          {(school.plan || school.billing_status) && (
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  <CreditCard className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-slate-900 dark:text-slate-50">Abonnement</h3>
              </div>
              <dl className="mt-4 divide-y divide-slate-100 text-sm dark:divide-[var(--border)]">
                {[
                  { label: "Plan", value: capitalizeFirst(school.plan) },
                  { label: "Statut", value: BILLING_LABELS[school.billing_status ?? ""] ?? capitalizeFirst(school.billing_status) },
                  ...(school.subscription_ends_at
                    ? [{ label: "Fin", value: new Date(school.subscription_ends_at).toLocaleDateString("fr-FR") }]
                    : []),
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-slate-500">{row.label}</dt>
                    <dd className="font-semibold text-slate-900 dark:text-slate-100">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                L’abonnement est géré par EduFaso. Contactez le support pour toute modification.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** One titled block of the form, with a "complete / n to fill" chip. */
function Section({
  icon: Icon,
  title,
  hint,
  missing,
  children,
}: {
  icon: typeof Building2;
  title: string;
  hint: string;
  missing: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 p-6 last:border-b-0 dark:border-[var(--border)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900 dark:text-slate-50">{title}</h2>
          <p className="truncate text-xs text-slate-500">{hint}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
            missing > 0
              ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
          )}
        >
          {missing > 0 ? (
            `${missing} à compléter`
          ) : (
            <>
              <Check className="h-3 w-3" />
              Complet
            </>
          )}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
