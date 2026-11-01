import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useActingTeacherId } from "@/hooks/useActingTeacherId";
import { supabase } from "@/lib/supabase";
import type { Evaluation, Profile } from "@/lib/types";
import { evaluationTypeLabel } from "@/lib/evaluationTypes";
import { cn, fullName, joinProfile, personName } from "@/lib/utils";
import { PersonName } from "@/components/PersonName";
import { SaveButton } from "@/components/SaveButton";
import { Card, EmptyState, Input } from "@/components/ui";

type GradeState = {
  score: string;
  absent: boolean;
  comment: string;
};

type RowStatus = "saved" | "changed" | "todo" | "absent";

const EMPTY_GRADE: GradeState = { score: "", absent: false, comment: "" };

/** Stable empty defaults — inline `= []` creates a new array every render and can loop useEffects. */
const EMPTY_OPEN_GRADES: {
  id: string;
  student_id: string;
  score: number;
  max_score: number;
  comment: string | null;
  is_absent: boolean;
}[] = [];

const STATUS_LABEL: Record<RowStatus, string> = {
  saved: "Enregistré",
  changed: "Modifié",
  todo: "À noter",
  absent: "Absent",
};

const STATUS_TEXT: Record<RowStatus, string> = {
  saved: "text-emerald-700 dark:text-emerald-400",
  changed: "text-sky-700 dark:text-sky-400",
  todo: "text-amber-700 dark:text-amber-400",
  absent: "text-slate-600 dark:text-slate-300",
};

const STATUS_BORDER: Record<RowStatus, string> = {
  saved: "border-l-emerald-600",
  changed: "border-l-sky-600",
  todo: "border-l-amber-500",
  absent: "border-l-slate-400",
};

function formatAvg(n: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

/** Dedicated grade-entry screen for one évaluation (opened from « Noter »). */
export default function NotesSaisie() {
  const { id, evalId } = useParams<{ id: string; evalId: string }>();
  const [searchParams] = useSearchParams();
  const fromDevoirs = searchParams.get("from") === "devoirs";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { actingTeacherId, isProxy, proxyTeacherId } = useActingTeacherId();
  const qc = useQueryClient();

  const [grades, setGrades] = useState<Record<string, GradeState>>({});
  const [savingGrades, setSavingGrades] = useState(false);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches,
  );
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const seeded = useRef(false);
  const focusedOnce = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const { data: openEval = null, isLoading: evalLoading } = useQuery({
    queryKey: ["evaluation-saisie", id, evalId],
    enabled: !!id && !!evalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("*")
        .eq("id", evalId!)
        .eq("class_section_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as Evaluation | null;
    },
  });

  const { data: className } = useQuery({
    queryKey: ["class-name", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("name")
        .eq("id", id!)
        .maybeSingle();
      return (data as { name: string } | null)?.name ?? null;
    },
  });

  const { data: subjectName } = useQuery({
    queryKey: ["subject-name", openEval?.subject_id],
    enabled: !!openEval?.subject_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("matieres")
        .select("name")
        .eq("id", openEval!.subject_id)
        .maybeSingle();
      return (data as { name: string } | null)?.name ?? null;
    },
  });

  const { data: students = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["class-roster-saisie", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inscriptions")
        .select(
          "profils:profils!inscriptions_student_id_fkey(*)",
        )
        .eq("class_section_id", id!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r) => joinProfile<Profile>((r as { profils: unknown }).profils))
        .filter((p): p is Profile => !!p?.id)
        .sort((a, b) =>
          fullName(a.first_name, a.last_name).localeCompare(
            fullName(b.first_name, b.last_name),
            "fr",
          ),
        );
    },
  });

  // Grades already saved for this evaluation.
  const { data: openGrades = EMPTY_OPEN_GRADES, isLoading: gradesLoading } =
    useQuery({
      queryKey: ["eval-grades", evalId],
      enabled: !!evalId,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("notes")
          .select("id, student_id, score, max_score, comment, is_absent")
          .eq("evaluation_id", evalId!);
        if (error) throw error;
        return data as {
          id: string;
          student_id: string;
          score: number;
          max_score: number;
          comment: string | null;
          is_absent: boolean;
        }[];
      },
    });

  /** What is stored in the database, in the same shape as the grid state. */
  const baseline = useMemo(() => {
    const map = new Map<string, GradeState>();
    for (const g of openGrades) {
      map.set(g.student_id, {
        score: g.is_absent ? "" : String(g.score),
        absent: g.is_absent,
        comment: g.comment ?? "",
      });
    }
    return map;
  }, [openGrades]);

  const getGrade = (studentId: string): GradeState =>
    grades[studentId] ?? EMPTY_GRADE;

  const setGrade = (studentId: string, patch: Partial<GradeState>) =>
    setGrades((prev) => ({
      ...prev,
      [studentId]: { ...getGrade(studentId), ...patch },
    }));

  const isChanged = (studentId: string, g: GradeState) => {
    const base = baseline.get(studentId) ?? EMPTY_GRADE;
    return (
      g.absent !== base.absent ||
      g.score.trim() !== base.score.trim() ||
      g.comment.trim() !== base.comment.trim()
    );
  };

  const changedCount = useMemo(
    () =>
      students.filter((s) => isChanged(s.id, grades[s.id] ?? EMPTY_GRADE))
        .length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, grades, baseline],
  );
  const dirtyRef = useRef(false);
  dirtyRef.current = changedCount > 0;

  // Seed the grid from saved grades — never overwrite unsaved typing on refetch.
  useEffect(() => {
    if (!evalId || gradesLoading) return;
    if (seeded.current && dirtyRef.current) return;
    const next: Record<string, GradeState> = {};
    for (const [studentId, g] of baseline) next[studentId] = g;
    seeded.current = true;
    setGrades((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [evalId, gradesLoading, baseline]);

  const maxScore = openEval?.max_score ?? 20;

  const rows = students.map((s) => {
    const g = getGrade(s.id);
    const scoreText = g.score.trim();
    const value = Number(scoreText);
    const invalid =
      !g.absent &&
      scoreText !== "" &&
      (!Number.isFinite(value) || value < 0 || value > maxScore);
    const noted = g.absent || scoreText !== "";
    const changed = isChanged(s.id, g);
    const status: RowStatus = g.absent
      ? "absent"
      : changed
        ? "changed"
        : noted
          ? "saved"
          : "todo";
    return { student: s, g, invalid, noted, changed, status, value };
  });

  const total = students.length;
  const notedCount = rows.filter((r) => r.noted).length;
  const invalidCount = rows.filter((r) => r.invalid).length;
  const remaining = total - notedCount;
  const progress = total > 0 ? Math.round((notedCount / total) * 100) : 0;
  const scored = rows.filter(
    (r) => !r.g.absent && r.g.score.trim() !== "" && !r.invalid,
  );
  const scores = scored.map((r) => r.value);

  const backTo = (() => {
    const params = new URLSearchParams();
    if (openEval) {
      params.set("subject", openEval.subject_id);
      params.set("period", openEval.period_label);
    }
    if (fromDevoirs) params.set("from", "devoirs");
    if (isProxy && proxyTeacherId) params.set("teacherId", proxyTeacherId);
    const q = params.toString();
    return `/classes/${id}/notes${q ? `?${q}` : ""}`;
  })();

  const saveGrades = async () => {
    if (!openEval || !id || !user) return;
    setSavingGrades(true);
    try {
      const existingByStudent = new Map(openGrades.map((g) => [g.student_id, g]));
      const toDelete: string[] = [];
      const toUpdate: Record<string, unknown>[] = [];
      const toInsert: Record<string, unknown>[] = [];

      for (const student of students) {
        const g = getGrade(student.id);
        const hasValue = g.absent || g.score.trim() !== "";
        const existing = existingByStudent.get(student.id);

        if (!hasValue) {
          if (existing) toDelete.push(existing.id);
          continue;
        }

        const score = g.absent ? 0 : Number(g.score);
        if (!g.absent && !Number.isFinite(score)) continue;

        const payload = {
          student_id: student.id,
          subject_id: openEval.subject_id,
          class_section_id: id,
          period_label: openEval.period_label,
          evaluation_id: openEval.id,
          score,
          max_score: openEval.max_score,
          is_absent: g.absent,
          comment: g.comment.trim() || null,
          recorded_by: isProxy ? actingTeacherId! : user.id,
        };

        if (existing) toUpdate.push({ id: existing.id, ...payload });
        else toInsert.push(payload);
      }

      // One request per kind of change (the old code sent one request per student, one
      // after the other, and ignored every error: a failed row was silently lost).
      // Every request is checked; the first failure stops the save and is shown.
      const CHUNK = 500;
      const chunks = <T,>(rows: T[]) =>
        Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) =>
          rows.slice(i * CHUNK, (i + 1) * CHUNK),
        );
      try {
        for (const part of chunks(toDelete)) {
          const { error } = await supabase.from("notes").delete().in("id", part);
          if (error) throw error;
        }
        for (const part of chunks(toUpdate)) {
          const { error } = await supabase
            .from("notes")
            .upsert(part, { onConflict: "id" });
          if (error) throw error;
        }
        for (const part of chunks(toInsert)) {
          const { error } = await supabase.from("notes").insert(part);
          if (error) throw error;
        }
      } catch (err) {
        // show what is really stored now, then report the failure
        void qc.invalidateQueries({ queryKey: ["eval-grades", openEval.id] });
        const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
        throw new Error(
          `Certaines notes n’ont pas été enregistrées${msg ? ` (${msg})` : ""}. Vérifiez la liste puis réessayez.`,
        );
      }
      const savedCount = students.filter((s) => {
        const g = getGrade(s.id);
        return g.absent || g.score.trim() !== "";
      }).length;
      toast.success("Notes enregistrées", {
        description: `${savedCount}/${students.length} élève(s) · ${openEval.title}`,
      });
      dirtyRef.current = false;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["eval-grades", openEval.id] }),
        qc.invalidateQueries({
          queryKey: [
            "eval-graded-counts",
            id,
            openEval.subject_id,
            openEval.period_label,
          ],
        }),
        qc.invalidateQueries({
          queryKey: [
            "ungraded-by-subject",
            id,
            openEval.period_label,
            actingTeacherId,
          ],
        }),
        qc.invalidateQueries({ queryKey: ["notes"] }),
        qc.invalidateQueries({ queryKey: ["mes-notes"] }),
        qc.invalidateQueries({ queryKey: ["mes-devoirs"] }),
        qc.invalidateQueries({ queryKey: ["student-home"] }),
        qc.invalidateQueries({ queryKey: ["teacher-mes-devoirs"] }),
      ]);
      navigate(backTo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSavingGrades(false);
    }
  };

  const canSave = changedCount > 0 && invalidCount === 0 && !savingGrades;
  const saveRef = useRef(() => {});
  saveRef.current = () => {
    if (canSave) void saveGrades();
  };

  // Ctrl+S / ⌘S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warn before closing the tab with unsaved grades.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Desktop: start on the first student still to grade.
  useEffect(() => {
    if (!isDesktop || focusedOnce.current || rows.length === 0) return;
    if (gradesLoading || !seeded.current) return;
    const first = rows.find((r) => !r.noted) ?? rows[0];
    const el = first ? inputRefs.current[first.student.id] : null;
    if (el) {
      focusedOnce.current = true;
      el.focus();
    }
  });

  const focusRow = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < rows.length; i += dir) {
      const el = inputRefs.current[rows[i]!.student.id];
      if (el && !el.disabled) {
        el.focus();
        el.select();
        return;
      }
    }
    if (dir === 1) (document.activeElement as HTMLElement | null)?.blur();
  };

  const onScoreChange = (studentId: string, raw: string) => {
    const v = raw.replace(",", ".");
    if (v === "" || /^\d{0,3}(\.\d{0,2})?$/.test(v)) {
      setGrade(studentId, { score: v });
    }
  };

  const onScoreKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(index, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(index, -1);
    }
  };

  const toggleAbsent = (studentId: string, absent: boolean) =>
    setGrade(studentId, {
      absent,
      score: absent ? "" : getGrade(studentId).score,
    });

  const confirmLeave = (e: React.MouseEvent) => {
    if (
      dirtyRef.current &&
      !window.confirm("Quitter sans enregistrer ? Les notes saisies seront perdues.")
    ) {
      e.preventDefault();
    }
  };

  const backLink = (
    <Link
      to={backTo}
      onClick={confirmLeave}
      className="mb-2 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      Retour aux évaluations
    </Link>
  );

  if (evalLoading || rosterLoading) {
    return <p className="text-slate-500">Chargement…</p>;
  }

  if (!openEval) {
    return (
      <div>
        {backLink}
        <EmptyState message="Évaluation introuvable." />
      </div>
    );
  }

  const subtitle = [
    className,
    subjectName,
    `Note sur ${openEval.max_score}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const saveButton = (size: "md" | "lg", className?: string) => (
    <SaveButton
      type="button"
      size={size}
      saving={savingGrades}
      dirty={changedCount > 0}
      disabled={invalidCount > 0}
      saveLabel={`Enregistrer (${changedCount})`}
      className={className}
      onClick={() => void saveGrades()}
    />
  );

  const statusHint =
    invalidCount > 0
      ? `Corrigez ${invalidCount} note${invalidCount > 1 ? "s" : ""} (0 à ${openEval.max_score})`
      : changedCount > 0
        ? `${changedCount} modification${changedCount > 1 ? "s" : ""} non enregistrée${changedCount > 1 ? "s" : ""}`
        : "Tout est enregistré";

  return (
    <div>
      <div className="z-20 mb-4 lg:sticky lg:top-0 lg:-mx-8 lg:-mt-8 lg:mb-6 lg:border-b lg:border-slate-200 lg:bg-[var(--bg)] lg:px-8 lg:pb-4 lg:pt-8 dark:lg:border-[var(--border)]">
        {backLink}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">
              {evaluationTypeLabel(openEval.type)} — {openEval.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="hidden items-center gap-4 lg:flex">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {notedCount}/{total} notés
            </span>
            <div
              className="h-2 w-56 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Progression de la saisie"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={notedCount}
            >
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {saveButton("md")}
          </div>
        </div>
        <div className="mt-3 lg:hidden">
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-label="Progression de la saisie"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={notedCount}
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
            <span>
              {notedCount}/{total} notés
            </span>
            {remaining > 0 ? (
              <span className="text-amber-700 dark:text-amber-400">
                {remaining} restant{remaining > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">
                Terminé
              </span>
            )}
          </div>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState message="Aucun élève dans cette classe." />
      ) : isDesktop ? (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-5 py-2.5">Élève</th>
                <th className="px-5 py-2.5">Note / {openEval.max_score}</th>
                <th className="px-5 py-2.5">Absent</th>
                <th className="px-5 py-2.5">Appréciation</th>
                <th className="px-5 py-2.5">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => {
                const s = r.student;
                const inputId = `note-${s.id}`;
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      "border-t border-slate-100 focus-within:bg-brand-50/60 dark:border-slate-700 dark:focus-within:bg-slate-700/40",
                    )}
                  >
                    <td className="px-5 py-2">
                      <label
                        htmlFor={inputId}
                        className="font-medium text-slate-900 dark:text-slate-100"
                      >
                        <PersonName first={s.first_name} last={s.last_name} />
                      </label>
                    </td>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          id={inputId}
                          ref={(el) => {
                            inputRefs.current[s.id] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          enterKeyHint="next"
                          aria-invalid={r.invalid || undefined}
                          className={cn(
                            "h-10 w-24 text-center font-semibold",
                            r.invalid &&
                              "border-red-500 focus:border-red-500 focus:ring-red-100",
                          )}
                          disabled={r.g.absent}
                          placeholder={r.g.absent ? "—" : ""}
                          value={r.g.score}
                          onChange={(e) => onScoreChange(s.id, e.target.value)}
                          onKeyDown={(e) => onScoreKeyDown(e, index)}
                        />
                        <span className="text-sm text-slate-500">
                          / {openEval.max_score}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-2">
                      <button
                        type="button"
                        aria-pressed={r.g.absent}
                        onClick={() => toggleAbsent(s.id, !r.g.absent)}
                        className={cn(
                          "inline-flex min-h-8 items-center rounded-full border px-3 text-xs! font-semibold! transition",
                          r.g.absent
                            ? "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-600 dark:text-amber-50"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:text-slate-200",
                        )}
                      >
                        {r.g.absent ? "Absent ✓" : "Absent"}
                      </button>
                    </td>
                    <td className="px-5 py-2">
                      <Input
                        aria-label={`Appréciation de ${personName(s.first_name, s.last_name)} (facultatif)`}
                        className="h-10 min-w-48"
                        placeholder="Facultatif"
                        value={r.g.comment}
                        onChange={(e) =>
                          setGrade(s.id, { comment: e.target.value })
                        }
                      />
                    </td>
                    <td
                      className={cn(
                        "px-5 py-2 font-semibold",
                        STATUS_TEXT[r.status],
                      )}
                    >
                      ● {r.invalid ? "Note invalide" : STATUS_LABEL[r.status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
            <span>
              ↑↓ ou Entrée : élève suivant · Tab : appréciation · Ctrl+S :
              enregistrer
            </span>
            {scores.length > 0 ? (
              <span>
                <b>
                  Moyenne provisoire :{" "}
                  {formatAvg(scores.reduce((a, b) => a + b, 0) / scores.length)}
                </b>{" "}
                · Min {formatAvg(Math.min(...scores))} · Max{" "}
                {formatAvg(Math.max(...scores))}
              </span>
            ) : null}
          </div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, index) => {
            const s = r.student;
            const inputId = `note-${s.id}`;
            const commentOpen = openComments[s.id] || r.g.comment !== "";
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-2xl border border-l-4 border-slate-200 bg-white p-3 shadow-sm dark:border-[var(--border)]",
                  STATUS_BORDER[r.status],
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={inputId}
                      className="block break-words text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100"
                    >
                      <PersonName first={s.first_name} last={s.last_name} />
                    </label>
                    <span
                      className={cn("text-xs font-medium", STATUS_TEXT[r.status])}
                    >
                      {r.invalid ? "Note invalide" : STATUS_LABEL[r.status]}
                    </span>
                    {!commentOpen ? (
                      <button
                        type="button"
                        className="ml-2 inline-flex items-center gap-0.5 text-xs! font-medium text-brand-700"
                        onClick={() =>
                          setOpenComments((prev) => ({ ...prev, [s.id]: true }))
                        }
                      >
                        <Plus className="h-3 w-3" />
                        Appréciation
                      </button>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Input
                      id={inputId}
                      ref={(el) => {
                        inputRefs.current[s.id] = el;
                      }}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint={index === rows.length - 1 ? "done" : "next"}
                      aria-invalid={r.invalid || undefined}
                      className={cn(
                        "h-12 w-[4.5rem] border-2 text-center text-xl font-bold",
                        r.invalid &&
                          "border-red-500 focus:border-red-500 focus:ring-red-100",
                      )}
                      disabled={r.g.absent}
                      placeholder={r.g.absent ? "—" : ""}
                      value={r.g.score}
                      onChange={(e) => onScoreChange(s.id, e.target.value)}
                      onKeyDown={(e) => onScoreKeyDown(e, index)}
                    />
                    <span className="text-xs text-slate-500">
                      /{openEval.max_score}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-pressed={r.g.absent}
                    onClick={() => toggleAbsent(s.id, !r.g.absent)}
                    className={cn(
                      "min-h-11 shrink-0 rounded-full border px-3 text-xs! font-semibold! transition",
                      r.g.absent
                        ? "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-600 dark:text-amber-50"
                        : "border-slate-300 bg-white text-slate-700 dark:text-slate-200",
                    )}
                  >
                    {r.g.absent ? "Absent ✓" : "Absent"}
                  </button>
                </div>
                {commentOpen ? (
                  <div className="mt-2">
                    <label
                      htmlFor={`comment-${s.id}`}
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Appréciation (facultatif)
                    </label>
                    <Input
                      id={`comment-${s.id}`}
                      value={r.g.comment}
                      onChange={(e) =>
                        setGrade(s.id, { comment: e.target.value })
                      }
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-4 flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6 lg:hidden dark:border-[var(--border)]">
        <p
          className={cn(
            "min-w-0 flex-1 text-xs",
            invalidCount > 0
              ? "font-medium text-red-600 dark:text-red-400"
              : "text-slate-600",
          )}
          aria-live="polite"
        >
          {statusHint}
        </p>
        {saveButton("lg", "shrink-0")}
      </div>
    </div>
  );
}
