import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

export default function Annees() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    const { error } = await supabase.from("annees_scolaires").insert({
      school_id: schoolId,
      label: label.trim(),
      start_date: startDate,
      end_date: endDate,
      is_current: years.length === 0,
    });
    if (error) {
      toast.error("Erreur lors de la création");
      return;
    }
    toast.success("Année scolaire créée");
    setLabel("");
    setStartDate("");
    setEndDate("");
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["annees", schoolId] });
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
      void qc.invalidateQueries({ queryKey: ["annees", schoolId] });
    }
  };

  return (
    <div>
      <PageHeader
        title="Années scolaires"
        actions={
          <Button onClick={() => setShowForm(!showForm)}>Nouvelle année</Button>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
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
                <Label>Début</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Créer</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
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
            <Card key={y.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{y.label}</h3>
                  {y.is_current ? <Badge tone="success">Courante</Badge> : null}
                </div>
                <p className="text-sm text-slate-500">
                  {new Date(y.start_date).toLocaleDateString("fr-FR")} —{" "}
                  {new Date(y.end_date).toLocaleDateString("fr-FR")}
                </p>
              </div>
              {!y.is_current ? (
                <Button size="sm" variant="outline" onClick={() => void setCurrent(y.id)}>
                  Définir comme courante
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
