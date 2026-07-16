import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear } from "@/lib/types";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import {
  Badge,
  Button,
  Card,
  DateInputFr,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";
import { isoToFr } from "@/lib/dateFr";

export default function Annees() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["annees", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annees_scolaires")
        .select("*")
        .eq("school_id", schoolId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as AcademicYear[];
    },
  });

  const resetForm = () => {
    setLabel("");
    setStartDate("");
    setEndDate("");
    setEditingId(null);
    setShowForm(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setLabel("");
    setStartDate("");
    setEndDate("");
    setShowForm(true);
  };

  const openEdit = (y: AcademicYear) => {
    setEditingId(y.id);
    setLabel(y.label);
    setStartDate(y.start_date.slice(0, 10));
    setEndDate(y.end_date.slice(0, 10));
    setShowForm(true);
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["annees", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["annee-courante", schoolId] });
    void qc.invalidateQueries({ queryKey: ["classes", schoolId] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (!startDate || !endDate) {
      toast.error("Indiquez les dates de début et de fin (jj/mm/aaaa)");
      return;
    }
    if (endDate < startDate) {
      toast.error("La date de fin doit être après la date de début");
      return;
    }

    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from("annees_scolaires")
        .update({
          label: label.trim(),
          start_date: startDate,
          end_date: endDate,
        })
        .eq("id", editingId)
        .eq("school_id", schoolId);
      setSaving(false);
      if (error) {
        toast.error(error.message || "Modification impossible");
        return;
      }
      toast.success("Année scolaire mise à jour");
    } else {
      const { error } = await supabase.from("annees_scolaires").insert({
        school_id: schoolId,
        label: label.trim(),
        start_date: startDate,
        end_date: endDate,
        is_current: years.length === 0,
      });
      setSaving(false);
      if (error) {
        toast.error(error.message || "Création impossible");
        return;
      }
      toast.success("Année scolaire créée");
    }

    resetForm();
    invalidate();
  };

  const setCurrent = async (id: string) => {
    if (!schoolId) return;
    await supabase
      .from("annees_scolaires")
      .update({ is_current: false })
      .eq("school_id", schoolId);
    const { error } = await supabase
      .from("annees_scolaires")
      .update({ is_current: true })
      .eq("id", id);
    if (error) toast.error("Erreur");
    else {
      toast.success("Année courante mise à jour");
      invalidate();
    }
  };

  const handleDelete = async (y: AcademicYear) => {
    if (!schoolId) return;

    const { count } = await supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("academic_year_id", y.id);

    if ((count ?? 0) > 0) {
      toast.error(
        `Impossible de supprimer : ${count} classe(s) sont liées à « ${y.label} ».`,
      );
      return;
    }

    const ok = window.confirm(
      `Supprimer l’année scolaire « ${y.label} » ? Cette action est définitive.`,
    );
    if (!ok) return;

    const { error } = await supabase
      .from("annees_scolaires")
      .delete()
      .eq("id", y.id)
      .eq("school_id", schoolId);

    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }

    if (editingId === y.id) resetForm();
    toast.success("Année scolaire supprimée");
    invalidate();
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Années scolaires"
        subtitle="Créez, modifiez ou définissez l’année courante"
        actions={
          <Button
            onClick={() => (showForm && !editingId ? resetForm() : openCreate())}
          >
            {showForm && !editingId ? "Fermer" : "Nouvelle année"}
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <h3 className="mb-4 font-semibold text-slate-900">
            {editingId ? "Modifier l’année scolaire" : "Nouvelle année scolaire"}
          </h3>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <Label>Libellé</Label>
              <Input
                placeholder="2025-2026"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="annee-debut">Début</Label>
                <DateInputFr
                  id="annee-debut"
                  value={startDate}
                  onChange={setStartDate}
                  required
                />
                <p className="mt-1 text-xs text-slate-500">Format : jj/mm/aaaa</p>
              </div>
              <div>
                <Label htmlFor="annee-fin">Fin</Label>
                <DateInputFr
                  id="annee-fin"
                  value={endDate}
                  onChange={setEndDate}
                  required
                />
                <p className="mt-1 text-xs text-slate-500">Format : jj/mm/aaaa</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Enregistrement…"
                  : editingId
                    ? "Enregistrer"
                    : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : years.length === 0 ? (
        <EmptyState message="Aucune année scolaire." />
      ) : (
        <div className="space-y-3">
          {years.map((y) => (
            <Card
              key={y.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{y.label}</h3>
                  {y.is_current ? <Badge tone="success">Courante</Badge> : null}
                </div>
                <p className="text-sm text-slate-500">
                  {isoToFr(y.start_date)} — {isoToFr(y.end_date)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!y.is_current ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setCurrent(y.id)}
                  >
                    Définir comme courante
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => openEdit(y)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => void handleDelete(y)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
