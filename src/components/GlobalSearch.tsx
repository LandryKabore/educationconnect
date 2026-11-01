import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Layers, Search, UserRound, Users, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { sortClassesByProgression } from "@/lib/classCatalog";
import {
  fetchParentsPage,
  fetchStudentsPage,
  fetchTeachersPage,
} from "@/lib/scaleApi";
import type { ClassSection } from "@/lib/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn, fullName, matchesSearch } from "@/lib/utils";

const PER_GROUP = 5;
const MIN_CHARS = 2;

type Hit = {
  key: string;
  group: "eleves" | "parents" | "enseignants" | "classes";
  title: string;
  detail?: string;
  to: string;
};

type Group = {
  id: Hit["group"];
  label: string;
  icon: React.ReactNode;
  total: number;
  hits: Hit[];
  allTo: string;
  failed: boolean;
};

/**
 * Search across the school's students, parents, teachers and classes (school admin only).
 * Every lookup goes through the same school-scoped, row-level-secured functions as the
 * Élèves / Parents / Enseignants pages, five results at a time.
 */
export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { schoolId, role } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const debounced = useDebouncedValue(query, 250).trim();
  const allowed = role === "school_admin" && !!schoolId;
  const searching = open && allowed && debounced.length >= MIN_CHARS;

  const { data: classesRaw = [] } = useQuery({
    queryKey: ["classes", schoolId],
    enabled: open && allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as ClassSection[];
    },
  });

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", schoolId, debounced],
    enabled: searching,
    staleTime: 30_000,
    queryFn: async () => {
      const [students, parents, teachers] = await Promise.allSettled([
        fetchStudentsPage(schoolId!, { search: debounced, limit: PER_GROUP }),
        fetchParentsPage(schoolId!, { search: debounced, limit: PER_GROUP }),
        fetchTeachersPage(schoolId!, { search: debounced, limit: PER_GROUP }),
      ]);
      return { students, parents, teachers };
    },
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const q = encodeURIComponent(debounced);

  const groups = useMemo<Group[]>(() => {
    if (!searching || !data) return [];
    const out: Group[] = [];
    const s = data.students;
    out.push({
      id: "eleves",
      label: "Élèves",
      icon: <GraduationCap className="h-4 w-4" />,
      total: s.status === "fulfilled" ? s.value.total : 0,
      failed: s.status === "rejected",
      allTo: `/eleves?q=${q}`,
      hits:
        s.status === "fulfilled"
          ? s.value.rows.map((r) => ({
              key: `s-${r.id}`,
              group: "eleves" as const,
              title: fullName(r.first_name, r.last_name),
              detail: [r.className ?? "Sans classe", r.matricule]
                .filter(Boolean)
                .join(" · "),
              to: `/eleves/${r.id}`,
            }))
          : [],
    });
    const p = data.parents;
    out.push({
      id: "parents",
      label: "Parents",
      icon: <Users className="h-4 w-4" />,
      total: p.status === "fulfilled" ? p.value.total : 0,
      failed: p.status === "rejected",
      allTo: `/parents?q=${q}`,
      hits:
        p.status === "fulfilled"
          ? p.value.rows.map((r) => ({
              key: `p-${r.id}`,
              group: "parents" as const,
              title: fullName(r.first_name, r.last_name),
              detail: r.children.length
                ? `Enfant(s) : ${r.children.join(", ")}`
                : "Aucun enfant lié",
              to: `/parents?q=${encodeURIComponent(fullName(r.first_name, r.last_name))}`,
            }))
          : [],
    });
    const t = data.teachers;
    out.push({
      id: "enseignants",
      label: "Enseignants",
      icon: <UserRound className="h-4 w-4" />,
      total: t.status === "fulfilled" ? t.value.total : 0,
      failed: t.status === "rejected",
      allTo: `/enseignants?q=${q}`,
      hits:
        t.status === "fulfilled"
          ? t.value.rows.map((r) => ({
              key: `t-${r.id}`,
              group: "enseignants" as const,
              title: fullName(r.first_name, r.last_name),
              to: `/enseignants?q=${encodeURIComponent(fullName(r.first_name, r.last_name))}`,
            }))
          : [],
    });
    const matchedClasses = sortClassesByProgression(
      classesRaw.filter((c) => matchesSearch(debounced, c.name, c.grade_level)),
    );
    out.push({
      id: "classes",
      label: "Classes",
      icon: <Layers className="h-4 w-4" />,
      total: matchedClasses.length,
      failed: false,
      allTo: `/eleves?classe=${matchedClasses[0]?.id ?? ""}`,
      hits: matchedClasses.slice(0, PER_GROUP).map((c) => ({
        key: `c-${c.id}`,
        group: "classes" as const,
        title: c.name,
        detail: "Voir les élèves de la classe",
        to: `/eleves?classe=${c.id}`,
      })),
    });
    return out.filter((g) => g.hits.length > 0 || g.failed);
  }, [data, searching, q, classesRaw, debounced]);

  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  useEffect(() => setCursor(0), [debounced]);

  if (!open || !allowed) return null;

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      const hit = flat[cursor];
      if (hit) {
        e.preventDefault();
        go(hit.to);
      }
    }
  };

  const loading = searching && (isFetching || !data) && groups.length === 0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/50 p-3 pt-[8vh] backdrop-blur-sm sm:p-6 sm:pt-[10vh]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche dans l’école"
        onKeyDown={onKeyDown}
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-[var(--border)] dark:bg-[var(--surface)]"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-[var(--border)]">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un élève, un parent, un enseignant, une classe…"
            aria-label="Rechercher dans l’école"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:text-slate-700"
            aria-label="Fermer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-live="polite">
          {debounced.length < MIN_CHARS ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              Tapez au moins {MIN_CHARS} lettres. Les accents sont ignorés.
            </p>
          ) : loading ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">Recherche…</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              Aucun résultat pour « {debounced} ».
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.id} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {g.icon}
                    {g.label}
                    {g.total > 0 ? ` (${g.total})` : ""}
                  </p>
                  {g.total > g.hits.length && g.id !== "classes" ? (
                    <button
                      type="button"
                      onClick={() => go(g.allTo)}
                      className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                    >
                      Voir tous les résultats →
                    </button>
                  ) : null}
                </div>
                {g.failed ? (
                  <p className="px-3 py-2 text-xs text-amber-700">
                    Cette recherche a échoué. Réessayez dans un instant.
                  </p>
                ) : null}
                <ul>
                  {g.hits.map((h) => {
                    const index = flat.indexOf(h);
                    return (
                      <li key={h.key}>
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => go(h.to)}
                          className={cn(
                            "flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                            index === cursor
                              ? "bg-brand-50 dark:bg-brand-900/30"
                              : "hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                          )}
                        >
                          <span className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-100">
                            {h.title}
                          </span>
                          {h.detail ? (
                            <span className="min-w-0 max-w-full truncate text-xs text-slate-500 sm:max-w-[55%]">
                              {h.detail}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <p className="hidden border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 sm:block dark:border-[var(--border)]">
          ↑ ↓ pour choisir · Entrée pour ouvrir · Échap pour fermer
        </p>
      </div>
    </div>
  );
}
