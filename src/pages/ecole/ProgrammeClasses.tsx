import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { AcademicYear, ClassSection, Subject } from "@/lib/types";
import { SetupGuideBar } from "@/components/SetupGuideBar";
import { Modal } from "@/components/Modal";
import { ClassColorDot } from "@/components/ClassColor";
import {
  CLASS_COLOR_SOFT,
  CLASS_COLOR_SURFACE,
  classColorVars,
} from "@/lib/classColors";
import { cn } from "@/lib/utils";
import {
  SUBJECT_CATEGORIES,
  resolveSubjectCategory,
} from "@/lib/subjectCatalog";
import { sortClassesByProgression } from "@/lib/classCatalog";
import { fetchProgrammeCountsByClass } from "@/lib/programmeCounts";
import {
  PROGRAMME_TEMPLATES,
  classMatchesTemplate,
  getTemplate,
  matchTemplateToSchoolSubjects,
  type ProgrammeTemplateId,
} from "@/lib/programmeTemplates";
import {
  Button,
  Card,
  EmptyState,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

function SubjectRow({
  subject,
  checked,
  coef,
  onToggle,
  onCoefChange,
}: {
  subject: Subject;
  checked: boolean;
  coef: string;
  onToggle: () => void;
  onCoefChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
        checked ? "bg-brand-50" : "hover:bg-slate-100 dark:hover:bg-[var(--surface-2)]",
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
          checked={checked}
          onChange={onToggle}
        />
        <span className="min-w-0 flex-1 font-medium leading-snug">
          {subject.name}
          {subject.code ? (
            <span className="ml-1 text-xs font-normal text-slate-400">
              ({subject.code})
            </span>
          ) : null}
        </span>
      </label>
      <input
        type="number"
        min="0.5"
        step="0.5"
        title={`Coefficient ${subject.name}`}
        aria-label={`Coefficient ${subject.name}`}
        disabled={!checked}
        value={checked ? coef : ""}
        placeholder="Coef"
        onChange={(e) => {
          if (!checked) return;
          onCoefChange(e.target.value);
        }}
        className={cn(
          "h-8 w-14 shrink-0 rounded-lg border px-1.5 text-center text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
          checked
            ? "border-slate-300 bg-white"
            : "border-slate-200 bg-slate-50 text-slate-300",
        )}
      />
    </div>
  );
}

export default function ProgrammeClasses() {
  const { schoolId } = useAuth();
  const qc = useQueryClient();

  const [yearId, setYearId] = useState("");
  const [templateId, setTemplateId] = useState<ProgrammeTemplateId | "">("");
  const [progSubjects, setProgSubjects] = useState<Set<string>>(
    () => new Set(),
  );
  const [progClasses, setProgClasses] = useState<Set<string>>(
    () => new Set(),
  );
  const [subjectCoefs, setSubjectCoefs] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [showExtraSubjects, setShowExtraSubjects] = useState(false);
  const [adjustClassId, setAdjustClassId] = useState("");

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

  const selectedTemplate = templateId ? getTemplate(templateId) : null;
  const isCustom = templateId === "custom";

  const templateMatch = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.id === "custom") {
      return { matched: [], missing: [] as ReturnType<
        typeof matchTemplateToSchoolSubjects
      >["missing"] };
    }
    return matchTemplateToSchoolSubjects(subjects, selectedTemplate);
  }, [subjects, selectedTemplate]);

  const suggestedClasses = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.id === "custom") {
      return classesForYear;
    }
    return classesForYear.filter((c) =>
      classMatchesTemplate(c, selectedTemplate),
    );
  }, [classesForYear, selectedTemplate]);

  const classesToShow = useMemo(() => {
    if (isCustom || showAllClasses || suggestedClasses.length === 0) {
      return classesForYear;
    }
    return suggestedClasses;
  }, [isCustom, showAllClasses, suggestedClasses, classesForYear]);

  const matchedSubjectIds = useMemo(
    () => new Set(templateMatch.matched.map((m) => m.subject.id)),
    [templateMatch],
  );

  const extraSchoolSubjects = useMemo(() => {
    if (isCustom) return [];
    return subjects.filter((s) => !matchedSubjectIds.has(s.id));
  }, [subjects, matchedSubjectIds, isCustom]);

  const applyTemplateSelection = (id: ProgrammeTemplateId) => {
    setTemplateId(id);
    setShowAllClasses(false);
    setShowExtraSubjects(false);
    const template = getTemplate(id);
    if (id === "custom") {
      setProgSubjects(new Set());
      setSubjectCoefs({});
      setProgClasses(new Set());
      setModalOpen(true);
      return;
    }
    const { matched } = matchTemplateToSchoolSubjects(subjects, template);
    setProgSubjects(new Set(matched.map((m) => m.subject.id)));
    const coefs: Record<string, string> = {};
    for (const m of matched) coefs[m.subject.id] = String(m.coefficient);
    setSubjectCoefs(coefs);
    // Classes are already filtered to the template — leave selection empty
    setProgClasses(new Set());
    setModalOpen(true);
    if (matched.length === 0) {
      toast.message(
        "Aucune matière de votre école ne correspond à ce modèle. Ajoutez-en dans Matières, ou choisissez Personnalisé.",
      );
    }
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
        setSubjectCoefs((coefs) => ({
          ...coefs,
          [id]: coefs[id] && coefs[id] !== "" ? coefs[id] : "1",
        }));
      }
      return next;
    });
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
    if (!templateId) {
      toast.error("Choisissez d’abord un modèle de programme.");
      return;
    }
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
      `Programme appliqué : ${progSubjects.size} matière(s) → ${progClasses.size} classe(s)`,
    );
    setProgClasses(new Set());
    setModalOpen(false);
    void qc.invalidateQueries({
      queryKey: ["classes-with-programme", schoolId],
    });
    void qc.invalidateQueries({ queryKey: ["school-setup", schoolId] });
    void qc.invalidateQueries({ queryKey: ["programme-classe"] });
  };

  const isLoading = loadingSubjects || loadingClasses;
  const doneCount = classesForYear.filter((c) =>
    classesWithProg.has(c.id),
  ).length;
  const todoCount = classesForYear.length - doneCount;

  return (
    <div>
      <SetupGuideBar />
      <PageHeader
        title="Programme par classe"
        subtitle="Appliquez un modèle à plusieurs classes, ou ajustez une classe en particulier"
      />

      <Card className="mb-6 border-brand-200 bg-brand-50">
        <p className="font-semibold text-brand-950">Comment ça marche</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
          <li>
            <strong>Appliquer un modèle</strong> — Primaire, Collège, Série
            A/C/D… pour plusieurs classes d’un coup.
          </li>
          <li>
            <strong>Ajuster une classe</strong> — en bas de la page, pour
            peaufiner une seule classe.
          </li>
        </ol>
      </Card>

      <Card className="mb-6">
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
              setAdjustClassId("");
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
        <>
          <Card className="mb-6">
            <p className="mb-5 text-sm text-slate-500">
              Progression : {doneCount}/{classesForYear.length} classe(s) avec
              programme
              {todoCount > 0 ? ` — ${todoCount} encore à faire` : ""}
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

            <div>
              <Label className="mb-2">Appliquer un modèle</Label>
              <p className="mb-3 text-xs text-slate-500">
                Choisissez un modèle : une fenêtre s’ouvre avec uniquement les
                matières et les classes qui lui correspondent.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PROGRAMME_TEMPLATES.map((t) => {
                  const active = templateId === t.id;
                  const matching =
                    t.id === "custom"
                      ? []
                      : classesForYear.filter((c) =>
                          classMatchesTemplate(c, t),
                        );
                  const sansProg = matching.filter(
                    (c) => !classesWithProg.has(c.id),
                  ).length;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplateSelection(t.id)}
                      className={cn(
                        "rounded-xl border px-3 py-3 text-left transition",
                        active
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                          : "border-slate-200 hover:border-brand-300 hover:bg-slate-100 dark:hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <p className="font-semibold text-slate-900">{t.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t.description}
                      </p>
                      {t.id !== "custom" && matching.length > 0 ? (
                        <p className="mt-2 text-xs font-medium text-brand-700">
                          {matching.length} classe(s) typique(s)
                        </p>
                      ) : null}
                      {t.id !== "custom" && sansProg > 0 ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          {sansProg} classe(s) sans programme
                        </p>
                      ) : t.id !== "custom" && matching.length > 0 ? (
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                          Toutes ont un programme
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {templateId ? (
                <button
                  type="button"
                  className="mt-3 text-xs font-medium text-brand-700 hover:underline"
                  onClick={() => setModalOpen(true)}
                >
                  Rouvrir « {selectedTemplate?.label} »
                </button>
              ) : null}
            </div>
          </Card>

          <Card className="mb-6">
            <h3 className="font-semibold text-slate-900">Ajuster une classe</h3>
            <p className="mt-1 text-sm text-slate-500">
              Corrigez un coefficient, ajoutez une matière ou voyez qui enseigne
              quoi.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <Label htmlFor="adjust-classe">Classe</Label>
                <Select
                  id="adjust-classe"
                  value={adjustClassId}
                  onChange={(e) => setAdjustClassId(e.target.value)}
                >
                  <option value="">Choisir une classe…</option>
                  {classesForYear.map((c) => {
                    const count = programmeCounts[c.id] ?? 0;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {count > 0
                          ? ` — ${count} matière(s)`
                          : " — À faire"}
                      </option>
                    );
                  })}
                </Select>
              </div>
              {adjustClassId ? (
                <Link
                  to={`/classes/${adjustClassId}?tab=programme`}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white transition hover:bg-brand-800"
                >
                  Ouvrir le programme
                </Link>
              ) : (
                <Button type="button" disabled>
                  Ouvrir le programme
                </Button>
              )}
            </div>
            {todoCount > 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                {todoCount} classe(s) sans programme encore.
              </p>
            ) : null}
          </Card>
        </>
      )}

      <Modal
        open={modalOpen && !!templateId}
        onClose={() => setModalOpen(false)}
        title={selectedTemplate ? selectedTemplate.label : "Programme"}
        size="lg"
      >
        <p className="mb-4 text-sm text-slate-500">
          {isCustom
            ? "Choisissez librement les matières et les classes."
            : `${classesToShow.length} classe(s) correspondent à ce modèle. Décochez les matières ou classes à exclure.`}
        </p>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label className="mb-0">Matières</Label>
              {isCustom ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() => {
                      setProgSubjects(new Set(subjects.map((s) => s.id)));
                      setSubjectCoefs((prev) => {
                        const next = { ...prev };
                        for (const s of subjects) {
                          if (!next[s.id]) next[s.id] = "1";
                        }
                        return next;
                      });
                    }}
                  >
                    Tout cocher
                  </button>
                  {progSubjects.size > 0 ? (
                    <button
                      type="button"
                      className="font-medium text-slate-500 hover:underline"
                      onClick={() => {
                        setProgSubjects(new Set());
                        setSubjectCoefs({});
                      }}
                    >
                      Tout décocher
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {progSubjects.size} cochée(s)
                </p>
              )}
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {isCustom
                ? "Catalogue de votre école — cochez celles à appliquer."
                : "Matières du modèle déjà présentes dans votre école."}
            </p>

            <div className="max-h-52 space-y-4 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {isCustom ? (
                subjectsByCategory.map(({ category, items }) => (
                  <div key={category}>
                    <p className="mb-1.5 text-sm font-medium text-slate-700">
                      {category}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {items.map((s) => (
                        <SubjectRow
                          key={s.id}
                          subject={s}
                          checked={progSubjects.has(s.id)}
                          coef={subjectCoefs[s.id] ?? "1"}
                          onToggle={() => toggleSubject(s.id)}
                          onCoefChange={(v) => setCoef(s.id, v)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : matchedSubjectIds.size === 0 &&
                !extraSchoolSubjects.some((s) => progSubjects.has(s.id)) ? (
                <p className="text-sm text-slate-500">
                  Aucune matière du modèle dans votre école pour l’instant.
                  Ajoutez-en via le bouton ci-dessous, ou dans{" "}
                  <Link
                    to="/matieres"
                    className="font-medium text-brand-700 underline"
                    onClick={() => setModalOpen(false)}
                  >
                    Matières
                  </Link>
                  .
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {subjects
                    .filter(
                      (s) =>
                        matchedSubjectIds.has(s.id) || progSubjects.has(s.id),
                    )
                    .map((s) => (
                      <SubjectRow
                        key={s.id}
                        subject={s}
                        checked={progSubjects.has(s.id)}
                        coef={subjectCoefs[s.id] ?? "1"}
                        onToggle={() => toggleSubject(s.id)}
                        onCoefChange={(v) => setCoef(s.id, v)}
                      />
                    ))}
                </div>
              )}
            </div>

            {!isCustom ? (
              <div className="mt-2">
                {extraSchoolSubjects.some((s) => !progSubjects.has(s.id)) ? (
                  <>
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-700 hover:underline"
                      onClick={() => setShowExtraSubjects((v) => !v)}
                    >
                        {showExtraSubjects
                          ? "Masquer le catalogue"
                          : `Ajouter une autre matière du catalogue (${extraSchoolSubjects.filter((s) => !progSubjects.has(s.id)).length})`}
                    </button>
                    {showExtraSubjects ? (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-dashed border-slate-200 p-2">
                        <div className="grid gap-1 sm:grid-cols-2">
                          {extraSchoolSubjects
                            .filter((s) => !progSubjects.has(s.id))
                            .map((s) => (
                              <SubjectRow
                                key={s.id}
                                subject={s}
                                checked={false}
                                coef={subjectCoefs[s.id] ?? "1"}
                                onToggle={() => toggleSubject(s.id)}
                                onCoefChange={(v) => setCoef(s.id, v)}
                              />
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <p className="mt-1.5 text-xs text-slate-400">
                  Pas encore dans l’école ? Créez-la d’abord dans{" "}
                  <Link
                    to="/matieres"
                    className="font-medium text-brand-700 underline"
                    onClick={() => setModalOpen(false)}
                  >
                    Matières
                  </Link>
                  .
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label className="mb-0">
                Classes{" "}
                <span className="font-normal text-slate-400">
                  ({classesToShow.length})
                </span>
              </Label>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {!isCustom && suggestedClasses.length > 0 ? (
                  <button
                    type="button"
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() => setShowAllClasses((v) => !v)}
                  >
                    {showAllClasses
                      ? `Voir seulement les ${suggestedClasses.length} classe(s) du modèle`
                      : `Voir toutes les classes (${classesForYear.length})`}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="font-medium text-brand-700 hover:underline"
                  onClick={() =>
                    setProgClasses(
                      new Set(
                        classesToShow
                          .filter((c) => !classesWithProg.has(c.id))
                          .map((c) => c.id),
                      ),
                    )
                  }
                >
                  Sans programme
                </button>
                <button
                  type="button"
                  className="font-medium text-brand-700 hover:underline"
                  onClick={() =>
                    setProgClasses(new Set(classesToShow.map((c) => c.id)))
                  }
                >
                  Toutes
                </button>
                {progClasses.size > 0 ? (
                  <button
                    type="button"
                    className="font-medium text-slate-500 hover:underline"
                    onClick={() => setProgClasses(new Set())}
                  >
                    Aucune
                  </button>
                ) : null}
              </div>
            </div>
            {!isCustom && suggestedClasses.length === 0 ? (
              <p className="mb-2 text-xs text-amber-700">
                Aucune classe ne correspond automatiquement à ce modèle —
                toutes les classes sont affichées, sélectionnez les vôtres.
              </p>
            ) : null}
            <div className="max-h-56 grid gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
              {classesToShow.map((c) => {
                const checked = progClasses.has(c.id);
                const subjectCount = programmeCounts[c.id] ?? 0;
                const hasProg = subjectCount > 0;
                return (
                  <label
                    key={c.id}
                    data-class-color
                    style={classColorVars({ id: c.id, name: c.name })}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-sm transition",
                      checked
                        ? CLASS_COLOR_SURFACE
                        : cn(
                            CLASS_COLOR_SOFT,
                            "hover:brightness-[0.98] dark:hover:brightness-110",
                          ),
                      !hasProg &&
                        "ring-1 ring-amber-400/70 dark:ring-amber-500/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                      checked={checked}
                      onChange={() => toggleClass(c.id)}
                    />
                    <ClassColorDot id={c.id} name={c.name} />
                    <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                    {hasProg ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        OK · {subjectCount}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
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
              Ajoute ou met à jour les matières (sans effacer les autres déjà
              présentes).
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
      </Modal>

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
