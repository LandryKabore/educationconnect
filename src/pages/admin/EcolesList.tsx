import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

export default function EcolesList() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("ecoles").insert({
      name: name.trim(),
      code: code.trim() || null,
      city: city.trim() || null,
    });
    if (error) {
      toast.error("Impossible de créer l'école");
      return;
    }
    toast.success("École créée");
    setName("");
    setCode("");
    setCity("");
    setShowForm(false);
    void qc.invalidateQueries({ queryKey: ["ecoles"] });
  };

  return (
    <div>
      <PageHeader
        title="Écoles"
        subtitle="Gestion des établissements"
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            Nouvelle école
          </Button>
        }
      />

      {showForm ? (
        <Card className="mb-6 max-w-lg">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label htmlFor="name">Nom</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="city">Ville</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
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
      ) : schools.length === 0 ? (
        <EmptyState message="Aucune école enregistrée." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schools.map((school) => (
            <Link key={school.id} to={`/admin/ecoles/${school.id}`}>
              <Card className="transition hover:border-brand-300 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-slate-900">{school.name}</h3>
                  <Badge tone={school.active ? "success" : "danger"}>
                    {school.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {school.code ? (
                  <p className="mt-1 text-sm text-slate-500">Code : {school.code}</p>
                ) : null}
                {school.city ? (
                  <p className="text-sm text-slate-500">{school.city}</p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
