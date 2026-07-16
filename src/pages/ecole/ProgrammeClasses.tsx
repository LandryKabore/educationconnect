import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear, ClassSection, Subject } from "@/lib/types";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { cn } from "@/lib/utils";
import {
  SUBJECT_CATEGORIES,
  resolveSubjectCategory,
} from "@/lib/subjectCatalog";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

export default function ProgrammeClasses() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();

  const [yearId, setYearId] = useState("");
  const [progSubjects, setProgSubjects] = useState<Set<string>>(() => new Set());
  const [progClasses, setProgClasses] = useState<Set<string>>(() => new Set());
  const [progCoef, setProgCoef] = useState("1");
  const [applying, setApplying] = useState(false);

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

  const { data: subjects = [], isLoading: loadingSubjects } = useQuery({
    queryKey: ["matieres", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("matieres")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as Subject[];
    },
  });

  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassSection[];
    },
  });

  const classesForYear = useMemo(
    () =>
      sortClassesByProgression(
        yearId ? classes.filter((c) => c.academic_year_id === yearId) : classes,
      ),
    [classes, yearId],
  );

  const subjectsByCategory = useMemo(() => {
    const map = new Map<string, Subject[]>();
    for (const s of subjects) {
      const cat = resolveSubjectCategory(s);
      const list = map.get(cat) ?? [];
      list.push(s);
      map.set(cat, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }
    const order = [...SUBJECT_CATEGORIES, "Autres"];
    return order
      .filter((cat) => (map.get(cat)?.length ?? 0) > 0)
      .map((cat) => ({ category: cat, items: map.get(cat)! }));
  }, [subjects]);

  const primarySubjectIds = useMemo(
    () =>
      subjectsByCategory.find((g) => g.category === "Primaire")?.items.map(
        (s) => s.id,
      ) ?? [],
    [subjectsByCategory],
  );

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

  const toggleSubject = (id: string) => {
    setProgSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClass = (id: string) => {
    setProgClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (progSubjects.size === 0) {
      toast.error("Cochez au moins une matière.");
      return;
    }
    if (progClasses.size === 0) {
      toast.error("Cochez au moins une classe.");
      return;
    }
    const coef = Number(progCoef);
    if (!coef || coef <= 0) {
      toast.error("Le coefficient doit être supérieur à 0.");
      return;
    }

    setApplying(true);
    const payload = [...progClasses].flatMap((classId) =>
      [...progSubjects].map((subjectId) => ({
        class_section_id: classId,
        subject_id: subjectId,
        coefficient: coef,
      })),
    );

    const { error } = await supabase.from("programme_classe").upsert(payload, {
      onConflict: "class_section_id,subject_id",
    });
    setApplying(false);

    if (error) {
      toast.error(error.message || "Application impossible");
      return;
    }

    toast.success(
      `${progSubjects.size} matière(s) → ${progClasses.size} classe(s)`,
    );
    setProgSubjects(new Set());
    setProgClasses(new Set());
    void qc.invalidateQueries({ queryKey: ["classes-with-programme", schoolId] });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["programme-classe"] });
  };

  const isLoading = loadingSubjects || loadingClasses;
  const doneCount = classesForYear.filter((c) => classesWithProg.has(c.id)).length;

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Programme par classe"
        subtitle="Appliquez des matières à plusieurs classes en une fois"
      />

      <Card className="mb-6 border-brand-100 bg-brand-50/60">
        <p className="font-semibold text-brand-950">Comment ça marche</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
          <li>Cochez les matières à enseigner.</li>
          <li>Cochez les classes qui reçoivent ces matières (ex. toutes les 6èmes).</li>
          <li>
            Indiquez un coefficient commun, puis cliquez sur{" "}
            <strong>Appliquer</strong>.
          </li>
        </ol>
        <p className="mt-3 text-sm text-brand-800">
          Vous pourrez ensuite ouvrir une classe pour ajuster un coef ou retirer
          une matière individuellement.
        </p>
      </Card>

      <Card className="mb-6 max-w-lg">
        <Label htmlFor="prog-annee">Année scolaire</Label>
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
            id="prog-annee"
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              setProgClasses(new Set());
            }}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.is_current ? " (courante)" : ""}
              </option>
            ))}
          </Select>
        )}
      </Card>

      {isLoading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : subjects.length === 0 ? (
        <EmptyState message="Ajoutez d’abord des matières au catalogue." />
      ) : classesForYear.length === 0 ? (
        <EmptyState message="Créez d’abord des classes pour cette année." />
      ) : (
        <Card className="mb-6">
          <p className="mb-5 text-sm text-slate-500">
            Progression : {doneCount}/{classesForYear.length} classe(s) avec
            programme
          </p>

          <div className="space-y-6">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label className="mb-0">1. Matières</Label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Sélection rapide :</span>
                  {primarySubjectIds.length > 0 ? (
                    <button
                      type="button"
                      className="font-medium text-brand-700 hover:underline"
                      onClick={() =>
                        setProgSubjects(new Set(primarySubjectIds))
                      }
                    >
                      Cocher le primaire
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() =>
                      setProgSubjects(new Set(subjects.map((s) => s.id)))
                    }
                  >
                    Tout cocher
                  </button>
                  {progSubjects.size > 0 ? (
                    <button
                      type="button"
                      className="font-medium text-slate-500 hover:underline"
                      onClick={() => setProgSubjects(new Set())}
                    >
                      Tout décocher
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="max-h-80 space-y-4 overflow-y-auto rounded-xl border border-slate-200 p-3">
                {subjectsByCategory.map(({ category, items }) => (
                  <div key={category}>
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {category}
                        </p>
                        {category === "Primaire" ? (
                          <p className="text-xs text-slate-500">
                            Curriculum CP–CM — Histoire et Géographie séparées
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="text-xs font-medium text-brand-700 hover:underline"
                        onClick={() =>
                          setProgSubjects((prev) => {
                            const next = new Set(prev);
                            for (const s of items) next.add(s.id);
                            return next;
                          })
                        }
                      >
                        Tout cocher
                      </button>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((s) => {
                        const checked = progSubjects.has(s.id);
                        return (
                          <label
                            key={s.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                              checked ? "bg-brand-50" : "hover:bg-slate-50",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                              checked={checked}
                              onChange={() => toggleSubject(s.id)}
                            />
                            <span className="min-w-0 flex-1 font-medium">
                              {s.name}
                              {s.code ? (
                                <span className="ml-1 text-xs font-normal text-slate-400">
                                  ({s.code})
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Label className="mb-0">2. Classes</Label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Sélection rapide :</span>
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() =>
                      setProgClasses(new Set(classesForYear.map((c) => c.id)))
                    }
                  >
                    Tout cocher
                  </button>
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() =>
                      setProgClasses(
                        new Set(
                          classesForYear
                            .filter((c) => !classesWithProg.has(c.id))
                            .map((c) => c.id),
                        ),
                      )
                    }
                  >
                    Cocher sans programme
                  </button>
                  {progClasses.size > 0 ? (
                    <button
                      type="button"
                      className="font-medium text-slate-500 hover:underline"
                      onClick={() => setProgClasses(new Set())}
                    >
                      Tout décocher
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="max-h-56 grid gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2 lg:grid-cols-3">
                {classesForYear.map((c) => {
                  const checked = progClasses.has(c.id);
                  const hasProg = classesWithProg.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                        checked ? "bg-brand-50" : "hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                        checked={checked}
                        onChange={() => toggleClass(c.id)}
                      />
                      <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                      {hasProg ? (
                        <span className="text-xs text-emerald-700">OK</span>
                      ) : (
                        <span className="text-xs text-amber-700">À faire</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <div className="w-28">
                <Label htmlFor="prog-coef">Coef.</Label>
                <Input
                  id="prog-coef"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={progCoef}
                  onChange={(e) => setProgCoef(e.target.value)}
                />
              </div>
              <p className="mb-2 flex-1 text-xs text-slate-500">
                Ajustable ensuite dans chaque fiche classe.
              </p>
              <Button
                type="button"
                disabled={
                  applying || progSubjects.size === 0 || progClasses.size === 0
                }
                onClick={() => void handleApply()}
              >
                {applying
                  ? "Application…"
                  : progSubjects.size === 0 || progClasses.size === 0
                    ? "Appliquer"
                    : `Appliquer (${progSubjects.size} × ${progClasses.size})`}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {subjects.length === 0 ? (
        <p className="text-sm text-slate-500">
          <Link to="/matieres" className="font-medium text-brand-700 underline">
            Aller aux matières
          </Link>
        </p>
      ) : classesForYear.length === 0 ? (
        <p className="text-sm text-slate-500">
          <Link to="/classes" className="font-medium text-brand-700 underline">
            Aller aux classes
          </Link>
        </p>
      ) : null}
    </div>
  );
}
