import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Subject } from "@/lib/types";
import {
  SUBJECT_CATALOG,
  SUBJECT_CATEGORIES,
  normalizeSubjectKey,
  type CatalogSubject,
} from "@/lib/subjectCatalog";
import { cn } from "@/lib/utils";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Modal } from "@/components/Modal";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@/components/ui";

function isAlreadyAdded(item: CatalogSubject, existing: Subject[]): boolean {
  const key = normalizeSubjectKey(item.name);
  const code = item.code.toUpperCase();
  return existing.some(
    (s) =>
      normalizeSubjectKey(s.name) === key ||
      (s.code && s.code.toUpperCase() === code),
  );
}

export default function Matieres() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showCustom, setShowCustom] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showCustom && !editingId) return;
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [showCustom, editingId]);

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data as Subject[];
    },
  });

  const { data: classCount = 0 } = useQuery({
    queryKey: ["classes-count", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { count } = await supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!);
      return count ?? 0;
    },
  });

  const catalogCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const item of SUBJECT_CATALOG) codes.add(item.code);
    return codes;
  }, []);

  const addedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of SUBJECT_CATALOG) {
      if (isAlreadyAdded(item, subjects)) keys.add(item.code);
    }
    return keys;
  }, [subjects]);

  const availableCount = [...catalogCodes].filter(
    (code) => !addedKeys.has(code),
  ).length;

  const resetCustomForm = () => {
    setName("");
    setCode("");
    setEditingId(null);
    setShowCustom(false);
  };

  const openCustomCreate = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setShowCustom(true);
  };

  const openEdit = (s: Subject) => {
    setShowCustom(true);
    setEditingId(s.id);
    setName(s.name);
    setCode(s.code ?? "");
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["matieres", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const toggleCatalog = (item: CatalogSubject) => {
    if (addedKeys.has(item.code)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.code)) next.delete(item.code);
      else next.add(item.code);
      return next;
    });
  };

  const selectCategory = (category: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of SUBJECT_CATALOG) {
        if (item.category !== category) continue;
        if (addedKeys.has(item.code)) continue;
        next.add(item.code);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleAddSelected = async () => {
    if (!schoolId || selected.size === 0) return;
    setSaving(true);

    const seen = new Set<string>();
    const rows: {
      school_id: string;
      name: string;
      code: string;
      coefficient: number;
    }[] = [];
    for (const item of SUBJECT_CATALOG) {
      if (!selected.has(item.code) || addedKeys.has(item.code)) continue;
      if (seen.has(item.code)) continue;
      seen.add(item.code);
      rows.push({
        school_id: schoolId,
        name: item.name,
        code: item.code,
        coefficient: 1,
      });
    }

    if (rows.length === 0) {
      setSaving(false);
      toast.message("Ces matières sont déjà dans le catalogue.");
      return;
    }

    const { error } = await supabase.from("matieres").insert(rows);
    setSaving(false);

    if (error) {
      toast.error(error.message || "Ajout impossible");
      return;
    }

    toast.success(
      rows.length === 1
        ? "Matière ajoutée au catalogue"
        : `${rows.length} matières ajoutées au catalogue`,
    );
    setSelected(new Set());
    invalidate();
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const dup = subjects.some(
      (s) =>
        s.id !== editingId &&
        (normalizeSubjectKey(s.name) === normalizeSubjectKey(trimmed) ||
          (code.trim() &&
            s.code &&
            s.code.toUpperCase() === code.trim().toUpperCase())),
    );
    if (dup) {
      toast.error("Cette matière existe déjà dans le catalogue.");
      return;
    }

    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from("matieres")
        .update({
          name: trimmed,
          code: code.trim() || null,
        })
        .eq("id", editingId)
        .eq("school_id", schoolId);
      setSaving(false);
      if (error) {
        toast.error(error.message || "Modification impossible");
        return;
      }
      toast.success("Matière mise à jour");
    } else {
      const { error } = await supabase.from("matieres").insert({
        school_id: schoolId,
        name: trimmed,
        code: code.trim() || null,
        coefficient: 1,
      });
      setSaving(false);
      if (error) {
        toast.error(error.message || "Création impossible");
        return;
      }
      toast.success("Matière personnalisée ajoutée");
    }

    resetCustomForm();
    invalidate();
  };

  const handleDelete = async (s: Subject) => {
    if (!schoolId) return;

    const [{ count: notesCount }, { count: programmeCount }, { count: affCount }] =
      await Promise.all([
        supabase
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", s.id),
        supabase
          .from("programme_classe")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", s.id),
        supabase
          .from("affectations_enseignement")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", s.id),
      ]);

    const usage = [
      (notesCount ?? 0) > 0 ? `${notesCount} note(s)` : null,
      (programmeCount ?? 0) > 0 ? `${programmeCount} classe(s)` : null,
      (affCount ?? 0) > 0 ? `${affCount} affectation(s)` : null,
    ].filter(Boolean);

    const ok = window.confirm(
      usage.length
        ? `Supprimer « ${s.name} » ?\n\nAttention : cela retirera aussi ${usage.join(", ")} liés à cette matière.`
        : `Supprimer la matière « ${s.name} » ?`,
    );
    if (!ok) return;

    const { error } = await supabase
      .from("matieres")
      .delete()
      .eq("id", s.id)
      .eq("school_id", schoolId);

    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }

    if (editingId === s.id) resetCustomForm();
    toast.success("Matière supprimée");
    invalidate();
  };

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Matières"
        subtitle="Catalogue de l’école — le programme se règle ensuite dans chaque classe"
        actions={
          <Button
            type="button"
            onClick={openCustomCreate}
          >
            <Plus className="h-4 w-4" />
            Matière personnalisée
          </Button>
        }
      />

      {(showCustom || editingId) && (
        <Modal
          open={showCustom || !!editingId}
          title={editingId ? "Modifier la matière" : "Matière personnalisée"}
          onClose={resetCustomForm}
          closeDisabled={saving}
        >
          <form
            onSubmit={(e) => void handleCustomSubmit(e)}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="matiere-nom">Nom</Label>
              <Input
                id="matiere-nom"
                ref={nameInputRef}
                name="name"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="matiere-code">Code (optionnel)</Label>
              <Input
                id="matiere-code"
                name="code"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ex. OPT"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Enregistrement…"
                  : editingId
                    ? "Enregistrer"
                    : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetCustomForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Matières courantes</h3>
            <p className="mt-1 text-sm text-slate-500">
              Cochez celles enseignées dans votre école
              {availableCount < catalogCodes.size
                ? ` · ${catalogCodes.size - availableCount} déjà ajoutée(s)`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearSelection}
              >
                Tout décocher
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={saving || selected.size === 0}
              onClick={() => void handleAddSelected()}
            >
              {saving
                ? "Ajout…"
                : selected.size === 0
                  ? "Ajouter au catalogue"
                  : `Ajouter (${selected.size})`}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {SUBJECT_CATEGORIES.map((category) => {
            const items = SUBJECT_CATALOG.filter(
              (item) => item.category === category,
            );
            if (items.length === 0) return null;
            const canSelectAny = items.some((item) => !addedKeys.has(item.code));
            return (
              <div key={category}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-medium text-slate-700">
                      {category}
                    </h4>
                    {category === "Primaire" ? (
                      <p className="text-xs text-slate-500">
                        Curriculum CP–CM — Histoire et Géographie sont séparées au
                        primaire
                      </p>
                    ) : null}
                    {category === "Sciences humaines (collège / lycée)" ? (
                      <p className="text-xs text-slate-500">
                        Au collège/lycée, prenez Histoire-Géographie (une seule
                        matière), pas Histoire et Géographie séparées
                      </p>
                    ) : null}
                  </div>
                  {canSelectAny ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-700 hover:underline"
                      onClick={() => selectCategory(category)}
                    >
                      Tout cocher
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const already = addedKeys.has(item.code);
                    const checked = already || selected.has(item.code);
                    return (
                      <label
                        key={item.code}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                          already
                            ? "cursor-default bg-emerald-50 text-emerald-900"
                            : checked
                              ? "cursor-pointer bg-brand-50 text-brand-950"
                              : "cursor-pointer hover:bg-slate-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 disabled:opacity-60"
                          checked={checked}
                          disabled={already}
                          onChange={() => toggleCatalog(item)}
                        />
                        <span className="min-w-0 flex-1 font-medium">
                          {item.name}
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            {item.code}
                          </span>
                        </span>
                        {already ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                            Ajoutée
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {subjects.length > 0 && classCount > 0 ? (
        <p className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950">
          Ensuite : dans{" "}
          <Link to="/programmes" className="font-medium underline">
            Programmes
          </Link>
          , appliquez ces matières à une ou plusieurs classes.
        </p>
      ) : null}

      <div className="mb-3">
        <h3 className="font-semibold text-slate-900">
          Catalogue de l’école
          {subjects.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({subjects.length})
            </span>
          ) : null}
        </h3>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : subjects.length === 0 ? (
        <EmptyState message="Aucune matière. Cochez la liste ci-dessus." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Card key={s.id}>
              <h3 className="font-semibold">{s.name}</h3>
              {s.code ? <p className="text-sm text-slate-500">{s.code}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => void handleDelete(s)}
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
