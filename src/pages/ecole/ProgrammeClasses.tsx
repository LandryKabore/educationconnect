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
import { fetchProgrammeCountsByClass } from "@/lib/programmeCounts";
import {
  Button,
  Card,
  EmptyState,
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
  const [subjectCoefs, setSubjectCoefs] = useState<Record<string, string>>({});
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

  const {
    data: programmeCounts = {},
    isError: programmeCountsError,
    error: programmeCountsErr,
    refetch: refetchProgrammeCounts,
  } = useQuery({
    queryKey: ["classes-with-programme", schoolId, "v4"],
    enabled: !!schoolId,
    queryFn: () => fetchProgrammeCountsByClass(schoolId!),
  });

  useEffect(() => {
    if (!programmeCountsError) return;
    const msg =
      programmeCountsErr instanceof Error
        ? programmeCountsErr.message
        : "Impossible de charger les programmes.";
    toast.error(msg);
  }, [programmeCountsError, programmeCountsErr]);

  const classesWithProg = useMemo(
    () => new Set(Object.keys(programmeCounts)),
    [programmeCounts],
  );

  const ensureCoef = (id: string) => {
    setSubjectCoefs((prev) =>
      prev[id] != null && prev[id] !== "" ? prev : { ...prev, [id]: "1" },
    );
  };

  const toggleSubject = (id: string) => {
    setProgSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSubjectCoefs((coefs) => {
          const copy = { ...coefs };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
        ensureCoef(id);
      }
      return next;
    });
  };

  const selectSubjects = (ids: string[]) => {
    setProgSubjects(new Set(ids));
    setSubjectCoefs((prev) => {
      const next: Record<string, string> = {};
      for (const id of ids) {
        next[id] = prev[id] && prev[id] !== "" ? prev[id] : "1";
      }
      return next;
    });
  };

  const clearSubjects = () => {
    setProgSubjects(new Set());
    setSubjectCoefs({});
  };

  const setCoef = (id: string, value: string) => {
    setSubjectCoefs((prev) => ({ ...prev, [id]: value }));
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

    const bad = [...progSubjects].find((id) => {
      const coef = Number(subjectCoefs[id] ?? "0");
      return !coef || coef <= 0;
    });
    if (bad) {
      const name = subjects.find((s) => s.id === bad)?.name ?? "une matière";
      toast.error(`Coefficient invalide pour « ${name} » (doit être > 0).`);
      return;
    }

    setApplying(true);
    const payload = [...progClasses].flatMap((classId) =>
      [...progSubjects].map((subjectId) => ({
        class_section_id: classId,
        subject_id: subjectId,
        coefficient: Number(subjectCoefs[subjectId] ?? "1"),
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
    clearSubjects();
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
          <li>Cochez les matières et réglez le coefficient de chacune.</li>
          <li>Cochez les classes qui reçoivent ces matières (ex. toutes les 6èmes).</li>
          <li>
            Cliquez sur <strong>Appliquer</strong>.
          </li>
        </ol>
        <p className="mt-3 text-sm text-brand-800">
          Pour corriger un coefficient ou voir qui enseigne quoi, ouvrez la
          classe → onglet Programme.
        </p>
      </Card>

      <Card className="mb-6 max-w-5xl">
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
        <Card className="mb-6 max-w-5xl">
          <p className="mb-5 text-sm text-slate-500">
            Progression : {doneCount}/{classesForYear.length} classe(s) avec
            programme
            {doneCount > 0
              ? " — ouvrez une classe ci-dessous pour voir les matières et coefficients."
              : ""}
          </p>
          {programmeCountsError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Impossible de charger les programmes enregistrés.{" "}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void refetchProgrammeCounts()}
              >
                Réessayer
              </button>
            </div>
          ) : null}

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
                      onClick={() => selectSubjects(primarySubjectIds)}
                    >
                      Cocher le primaire
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() => selectSubjects(subjects.map((s) => s.id))}
                  >
                    Tout cocher
                  </button>
                  {progSubjects.size > 0 ? (
                    <button
                      type="button"
                      className="font-medium text-slate-500 hover:underline"
                      onClick={clearSubjects}
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
                        onClick={() => {
                          const ids = items.map((s) => s.id);
                          setProgSubjects((prev) => {
                            const next = new Set(prev);
                            for (const id of ids) next.add(id);
                            return next;
                          });
                          setSubjectCoefs((prev) => {
                            const next = { ...prev };
                            for (const id of ids) {
                              if (next[id] == null || next[id] === "") {
                                next[id] = "1";
                              }
                            }
                            return next;
                          });
                        }}
                      >
                        Tout cocher
                      </button>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((s) => {
                        const checked = progSubjects.has(s.id);
                        return (
                          <div
                            key={s.id}
                            className={cn(
                              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
                              checked ? "bg-brand-50" : "hover:bg-slate-50",
                            )}
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                                checked={checked}
                                onChange={() => toggleSubject(s.id)}
                              />
                              <span className="min-w-0 flex-1 font-medium leading-snug">
                                {s.name}
                                {s.code ? (
                                  <span className="ml-1 text-xs font-normal text-slate-400">
                                    ({s.code})
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            <input
                              type="number"
                              min="0.5"
                              step="0.5"
                              title={`Coefficient ${s.name}`}
                              aria-label={`Coefficient ${s.name}`}
                              disabled={!checked}
                              value={checked ? (subjectCoefs[s.id] ?? "1") : ""}
                              placeholder="Coef"
                              onChange={(e) => {
                                if (!checked) return;
                                setCoef(s.id, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "h-8 w-14 shrink-0 rounded-lg border px-1.5 text-center text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
                                checked
                                  ? "border-slate-300 bg-white"
                                  : "border-slate-200 bg-slate-50 text-slate-300",
                              )}
                            />
                          </div>
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
                  const subjectCount = programmeCounts[c.id] ?? 0;
                  const hasProg = subjectCount > 0;
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
                        <span className="shrink-0 text-xs text-emerald-700">
                          OK · {subjectCount}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-amber-700">
                          À faire
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                Chaque matière utilise son propre coefficient (modifiable à
                droite).
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

      {classesForYear.length > 0 ? (
        <Card className="mb-6 max-w-5xl">
          <h3 className="font-semibold text-slate-900">
            Ajuster une classe
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Ouvrez une classe pour corriger un coefficient ou voir qui enseigne
            chaque matière.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {classesForYear.map((c) => {
              const subjectCount = programmeCounts[c.id] ?? 0;
              const hasProg = subjectCount > 0;
              return (
                <Link
                  key={c.id}
                  to={`/classes/${c.id}?tab=programme`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      hasProg ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {hasProg ? `${subjectCount} matière(s)` : "À faire"}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}

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
