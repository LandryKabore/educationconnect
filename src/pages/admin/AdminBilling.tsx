import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import type { School } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

const PLANS = [
  { value: "essai", label: "Essai" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
] as const;

const BILLING_STATUSES = [
  { value: "trial", label: "Essai" },
  { value: "active", label: "Actif" },
  { value: "past_due", label: "Impayé" },
  { value: "cancelled", label: "Annulé" },
] as const;

type BillingDraft = {
  plan: string;
  billing_status: string;
  subscription_ends_at: string;
};

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function billingTone(status: string | null): "success" | "warning" | "danger" | "info" | "default" {
  if (status === "active") return "success";
  if (status === "trial") return "info";
  if (status === "past_due") return "warning";
  if (status === "cancelled") return "danger";
  return "default";
}

function billingLabel(status: string | null) {
  return BILLING_STATUSES.find((s) => s.value === status)?.label ?? status ?? "—";
}

export default function AdminBilling() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, BillingDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["admin-billing-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ecoles")
        .select("id, name, active, plan, billing_status, subscription_ends_at")
        .order("name");
      if (error) throw error;
      return data as School[];
    },
  });

  const getDraft = (school: School): BillingDraft => {
    if (drafts[school.id]) return drafts[school.id];
    return {
      plan: school.plan ?? "essai",
      billing_status: school.billing_status ?? "trial",
      subscription_ends_at: toDateInputValue(school.subscription_ends_at),
    };
  };

  const setDraftField = (schoolId: string, school: School, key: keyof BillingDraft, value: string) => {
    setDrafts((prev) => {
      const current =
        prev[schoolId] ?? {
          plan: school.plan ?? "essai",
          billing_status: school.billing_status ?? "trial",
          subscription_ends_at: toDateInputValue(school.subscription_ends_at),
        };
      return {
        ...prev,
        [schoolId]: { ...current, [key]: value },
      };
    });
  };

  const saveSchool = async (school: School) => {
    const draft = getDraft(school);
    setSavingId(school.id);

    const payload = {
      plan: draft.plan,
      billing_status: draft.billing_status,
      subscription_ends_at: draft.subscription_ends_at
        ? new Date(`${draft.subscription_ends_at}T23:59:59`).toISOString()
        : null,
    };

    const { error } = await supabase.from("ecoles").update(payload).eq("id", school.id);
    setSavingId(null);

    if (error) {
      toast.error("Impossible d'enregistrer l'abonnement");
      return;
    }

    await logAudit("update_billing", "school", school.id, payload);
    toast.success(`Abonnement mis à jour — ${school.name}`);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[school.id];
      return next;
    });
    void qc.invalidateQueries({ queryKey: ["admin-billing-schools"] });
    void qc.invalidateQueries({ queryKey: ["ecoles"] });
  };

  return (
    <div>
      <PageHeader
        title="Abonnements"
        subtitle="Plans et statuts de facturation par école"
      />

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : schools.length === 0 ? (
          <EmptyState message="Aucune école enregistrée." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-3 font-medium">École</th>
                  <th className="pb-2 pr-3 font-medium">Plan</th>
                  <th className="pb-2 pr-3 font-medium">Statut</th>
                  <th className="pb-2 pr-3 font-medium">Fin d'abonnement</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => {
                  const draft = getDraft(school);
                  const saving = savingId === school.id;

                  return (
                    <tr key={school.id} className="border-b border-slate-100 align-middle">
                      <td className="py-3 pr-3">
                        <Link
                          to={`/admin/ecoles/${school.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {school.name}
                        </Link>
                        <div className="mt-1">
                          <Badge tone={school.active ? "success" : "danger"}>
                            {school.active ? "Active" : "Inactive"}
                          </Badge>
                          {!drafts[school.id] ? (
                            <span className="ml-2">
                              <Badge tone={billingTone(school.billing_status)}>
                                {billingLabel(school.billing_status)}
                              </Badge>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <Select
                          className="min-w-[8rem]"
                          value={draft.plan}
                          onChange={(e) =>
                            setDraftField(school.id, school, "plan", e.target.value)
                          }
                        >
                          {PLANS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-3 pr-3">
                        <Select
                          className="min-w-[8rem]"
                          value={draft.billing_status}
                          onChange={(e) =>
                            setDraftField(school.id, school, "billing_status", e.target.value)
                          }
                        >
                          {BILLING_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-3 pr-3">
                        <Input
                          type="date"
                          className="min-w-[10rem]"
                          value={draft.subscription_ends_at}
                          onChange={(e) =>
                            setDraftField(
                              school.id,
                              school,
                              "subscription_ends_at",
                              e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="py-3">
                        <Button
                          type="button"
                          size="sm"
                          disabled={saving}
                          onClick={() => void saveSchool(school)}
                        >
                          {saving ? "…" : "Enregistrer"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
