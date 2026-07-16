import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear, ClassSection } from "@/lib/types";
import {
  CLASS_CATALOG,
  CLASS_CATEGORIES,
  normalizeClassName,
  sortClassesByProgression,
  type CatalogClass,
} from "@/lib/classCatalog";
import { ConfirmPasswordDialog } from "@/components/ConfirmPasswordDialog";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function Classes() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();

  const [yearId, setYearId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<ClassSection | null>(null);

  const [showCustom, setShowCustom] = useState(false);
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [capacity, setCapacity] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: years = [] } = useQuery({
    queryKey: ["annees", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("annees_scolaires")
        .select("*")
        .eq("school_id", schoolId!)
        .order("start_date", { ascending: false });
      return (data ?? []) as AcademicYear[];
    },
  });

  useEffect(() => {
    if (!yearId && years.length) {
      const current = years.find((y) => y.is_current) ?? years[0];
      setYearId(current.id);
    }
  }, [years, yearId]);

  useEffect(() => {
    if (!showCustom) return;
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [showCustom]);

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, annees_scolaires(label)")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data as (ClassSection & { annees_scolaires: { label: string } })[];
    },
  });

  const { data: classesWithProg = new Set<string>() } = useQuery({
    queryKey: ["classes-with-programme", schoolId],
    enabled: !!schoolId && classes.length > 0,
    queryFn: async () => {
      const ids = classes.map((c) => c.id);
      const { data } = await supabase
        .from("programme_classe")
        .select("class_section_id")
        .in("class_section_id", ids);
      return new Set((data ?? []).map((r) => r.class_section_id as string));
    },
  });

  const classesForYear = useMemo(
    () =>
      sortClassesByProgression(
        yearId ? classes.filter((c) => c.academic_year_id === yearId) : classes,
      ),
    [classes, yearId],
  );

  const addedIds = useMemo(() => {
    const keys = new Set<string>();
    if (!yearId) return keys;
    const existingNames = new Set(
      classes
        .filter((c) => c.academic_year_id === yearId)
        .map((c) => normalizeClassName(c.name)),
    );
    for (const item of CLASS_CATALOG) {
      if (existingNames.has(normalizeClassName(item.name))) {
        keys.add(item.id);
      }
    }
    return keys;
  }, [classes, yearId]);

  const availableCount = CLASS_CATALOG.filter((item) => !addedIds.has(item.id)).length;

  const resetCustomForm = () => {
    setName("");
    setGradeLevel("");
    setCapacity("");
    setShowCustom(false);
  };

  const openCustomCreate = () => {
    setName("");
    setGradeLevel("");
    setCapacity("");
    setShowCustom(true);
  };

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["classes", schoolId] });
    void qc.invalidateQueries({ queryKey: ["classes-with-programme", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
  };

  const findClassForCatalogItem = (item: CatalogClass) => {
    if (!yearId) return undefined;
    const key = normalizeClassName(item.name);
    return classes.find(
      (c) =>
        c.academic_year_id === yearId && normalizeClassName(c.name) === key,
    );
  };

  const removeClass = async (cls: ClassSection) => {
    if (!schoolId) return;

    setSaving(true);
    const { error } = await supabase
      .from("classes")
      .delete()
      .eq("id", cls.id)
      .eq("school_id", schoolId);
    setSaving(false);
    setPendingRemove(null);

    if (error) {
      toast.error(error.message || "Suppression impossible");
      return;
    }
    toast.success(`« ${cls.name} » retirée`);
    invalidate();
  };

  const toggleCatalog = (item: CatalogClass) => {
    if (!yearId) return;

    const existing = findClassForCatalogItem(item);
    if (existing) {
      setPendingRemove(existing);
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const selectCategory = (category: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of CLASS_CATALOG) {
        if (item.category !== category) continue;
        if (addedIds.has(item.id)) continue;
        next.add(item.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleAddSelected = async () => {
    if (!schoolId || !yearId) {
      toast.error("Choisissez d’abord une année scolaire.");
      return;
    }
    if (selected.size === 0) return;

    const toCreate = CLASS_CATALOG.filter(
      (item) => selected.has(item.id) && !addedIds.has(item.id),
    );
    if (toCreate.length === 0) {
      toast.message("Ces classes existent déjà pour cette année.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("classes").insert(
      toCreate.map((item) => ({
        school_id: schoolId,
        academic_year_id: yearId,
        name: item.name,
        grade_level: item.gradeLevel,
        capacity: null,
      })),
    );
    setSaving(false);

    if (error) {
      toast.error(error.message || "Ajout impossible");
      return;
    }

    toast.success(
      toCreate.length === 1
        ? "Classe ajoutée"
        : `${toCreate.length} classes ajoutées`,
    );
    setSelected(new Set());
    invalidate();
  };

  const handleCustomCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !yearId) {
      toast.error("Choisissez d’abord une année scolaire.");
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) return;

    const dup = classes.some(
      (c) =>
        c.academic_year_id === yearId &&
        normalizeClassName(c.name) === normalizeClassName(trimmed),
    );
    if (dup) {
      toast.error("Cette classe existe déjà pour cette année.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("classes").insert({
      school_id: schoolId,
      academic_year_id: yearId,
      name: trimmed,
      grade_level: gradeLevel.trim() || trimmed,
      capacity: capacity ? Number(capacity) : null,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message || "Erreur lors de la création");
      return;
    }

    toast.success("Classe créée");
    resetCustomForm();
    invalidate();
  };

  return (
    <div>
      <SetupGuideBar />
      <ConfirmPasswordDialog
        open={!!pendingRemove}
        title={
          pendingRemove
            ? `Retirer « ${pendingRemove.name} » ?`
            : "Confirmer"
        }
        description="Cette action peut affecter inscriptions, programmes et notes. Saisissez votre mot de passe administrateur pour confirmer."
        confirmLabel="Retirer la classe"
        onCancel={() => setPendingRemove(null)}
        onVerified={async () => {
          if (pendingRemove) await removeClass(pendingRemove);
        }}
      />
      <PageHeader
        title="Classes"
        subtitle="Créez les classes de l’année — le programme se fait à l’étape suivante"
        actions={
          <Button
            type="button"
            variant={showCustom ? "outline" : "primary"}
            onClick={() => (showCustom ? resetCustomForm() : openCustomCreate())}
          >
            <Plus className="h-4 w-4" />
            {showCustom ? "Fermer" : "Classe personnalisée"}
          </Button>
        }
      />

      <Card className="mb-6 max-w-lg">
        <Label htmlFor="classe-annee">Année scolaire</Label>
        {years.length === 0 ? (
          <p className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Créez d’abord une année dans{" "}
            <Link to="/annees" className="font-medium underline">
              Années scolaires
            </Link>
            .
          </p>
        ) : (
          <Select
            id="classe-annee"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setSelected(new Set());
            }}
            required
          >
            <option value="">Choisir…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.is_current ? " (courante)" : ""}
              </option>
            ))}
          </Select>
        )}
      </Card>

      {showCustom ? (
        <Card className="mb-6 max-w-xl">
          <h3 className="mb-4 font-semibold text-slate-900">Classe personnalisée</h3>
          <form
            onSubmit={(e) => void handleCustomCreate(e)}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="classe-nom">Nom</Label>
              <Input
                id="classe-nom"
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. 1ère C"
                required
              />
            </div>
            <div>
              <Label htmlFor="classe-niveau">Niveau</Label>
              <Input
                id="classe-niveau"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="ex. Première"
              />
            </div>
            <div>
              <Label htmlFor="classe-capacite">Capacité (optionnel)</Label>
              <Input
                id="classe-capacite"
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !yearId}>
                {saving ? "Création…" : "Créer"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetCustomForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Classes courantes</h3>
            <p className="mt-1 text-sm text-slate-500">
              Cochez pour ajouter · décochez « Créée » + mot de passe pour retirer
              {yearId && availableCount < CLASS_CATALOG.length
                ? ` · ${CLASS_CATALOG.length - availableCount} déjà créée(s)`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                Tout décocher
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={saving || selected.size === 0 || !yearId}
              onClick={() => void handleAddSelected()}
            >
              {saving
                ? "Ajout…"
                : selected.size === 0
                  ? "Ajouter la sélection"
                  : `Ajouter (${selected.size})`}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {CLASS_CATEGORIES.map((category) => {
            const items = CLASS_CATALOG.filter((item) => item.category === category);
            if (items.length === 0) return null;
            const canSelectAny = items.some((item) => !addedIds.has(item.id));
            return (
              <div key={category}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium text-slate-700">{category}</h4>
                  {canSelectAny && yearId ? (
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
                    const already = addedIds.has(item.id);
                    const checked = already || selected.has(item.id);
                    return (
                      <label
                        key={item.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                          already
                            ? "bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                            : checked
                              ? "bg-brand-50 text-brand-950"
                              : "hover:bg-slate-50",
                          !yearId ? "pointer-events-none opacity-50" : "",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                          checked={checked}
                          disabled={!yearId || saving}
                          onChange={() => toggleCatalog(item)}
                        />
                        <span className="min-w-0 flex-1 font-medium">
                          {item.name}
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            {item.gradeLevel}
                          </span>
                        </span>
                        {already ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                            Créée
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

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : classesForYear.length === 0 ? (
        <EmptyState message="Aucune classe pour cette année. Cochez la liste ci-dessus." />
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">
              {classesForYear.length} classe(s) pour cette année
            </p>
            <p className="text-sm text-slate-500">
              {classesForYear.filter((c) => classesWithProg.has(c.id)).length}/
              {classesForYear.length} avec programme — décochez une classe
              « Créée » (mot de passe requis) pour la retirer
            </p>
          </div>
          <Link to="/programmes">
            <Button type="button">Définir les programmes →</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
