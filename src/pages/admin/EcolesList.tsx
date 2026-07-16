import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import {
  emptySchoolForm,
  formToSchoolPayload,
  isSchoolFormComplete,
  schoolTypeLabel,
  type SchoolFormFields,
} from "@/lib/schoolForm";
import { SchoolFieldsForm } from "@/components/SchoolFieldsForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";

export default function EcolesList() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SchoolFormFields>(emptySchoolForm);
  const [submitting, setSubmitting] = useState(false);

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["ecoles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ecoles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as School[];
    },
  });

  const setField = (key: keyof SchoolFormFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSchoolFormComplete(form)) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from("ecoles")
      .insert(formToSchoolPayload(form));
    setSubmitting(false);

    if (error) {
      toast.error(
        error.message.includes("duplicate") || error.code === "23505"
          ? "Ce code d'école existe déjà"
          : "Impossible de créer l'école"
      );
      return;
    }

    toast.success("École créée");
    setForm(emptySchoolForm);
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["ecoles"] });
  };

  return (
    <div>
      <PageHeader
        title="Écoles"
        subtitle="Créer et gérer les établissements"
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            Nouvelle école
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-2xl">
          <h2 className="mb-1 text-lg font-semibold">Nouvelle école</h2>
          <p className="mb-4 text-sm text-slate-500">
            Tous les champs sont obligatoires.
          </p>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <SchoolFieldsForm form={form} onChange={setField} idPrefix="new" />
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Création…" : "Créer l’école"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptySchoolForm);
                }}
              >
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : schools.length === 0 ? (
        <EmptyState message="Aucune école enregistrée." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schools.map((school) => (
            <Link key={school.id} to={`/admin/ecoles/${school.id}`}>
              <Card className="transition hover:border-brand-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{school.name}</h3>
                  <Badge tone={school.active ? "success" : "danger"}>
                    {school.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {school.code ? (
                  <p className="mt-1 text-sm text-slate-500">Code : {school.code}</p>
                ) : null}
                <p className="text-sm text-slate-500">
                  {schoolTypeLabel(school.school_type)}
                </p>
                <p className="text-sm text-slate-500">
                  {[school.city, school.region].filter(Boolean).join(" · ") || "—"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
