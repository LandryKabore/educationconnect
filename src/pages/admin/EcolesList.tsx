import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { School } from "@/lib/types";
import {
  emptySchoolForm,
  formToSchoolPayload,
  isSchoolFormComplete,
  schoolTypeLabel,
  type SchoolFormFields,
} from "@/lib/schoolForm";
import { SchoolFieldsForm } from "@/components/SchoolFieldsForm";
import { Modal } from "@/components/Modal";
import { SearchField } from "@/components/SearchField";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  AdminCard,
  AdminEmpty,
  AdminLoading,
  AdminPageHeader,
  AdminStatusDot,
} from "@/components/admin/AdminKit";
import {
  MODULES,
  isMissingTableError,
  resolveModuleStates,
  type SchoolModuleRow,
} from "@/lib/modules";

type Filter = "toutes" | "actives" | "inactives" | "sans_admin";

type SchoolRow = School & { adminCount: number; modulesOn: number | null };

const AVAILABLE_MODULES = MODULES.filter((m) => m.available).length;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function EcolesList() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SchoolFormFields>(emptySchoolForm);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("toutes");

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["ecoles"],
    queryFn: async () => {
      const [
        { data, error },
        { data: adminRoles, error: rolesErr },
        { data: moduleRows, error: modulesErr },
      ] = await Promise.all([
        supabase.from("ecoles").select("*").order("name"),
        supabase
          .from("roles_utilisateurs")
          .select("school_id")
          .eq("role", "school_admin")
          .eq("active", true),
        supabase
          .from("ecole_modules")
          .select("school_id, module_key, enabled, settings"),
      ]);
      if (error) throw error;
      if (rolesErr) throw rolesErr;
      const modulesKnown = !modulesErr || !isMissingTableError(modulesErr);
      const modulesBySchool = new Map<string, SchoolModuleRow[]>();
      for (const row of (moduleRows ?? []) as SchoolModuleRow[]) {
        const list = modulesBySchool.get(row.school_id) ?? [];
        list.push(row);
        modulesBySchool.set(row.school_id, list);
      }

      const adminCounts = new Map<string, number>();
      for (const row of adminRoles ?? []) {
        if (!row.school_id) continue;
        adminCounts.set(
          row.school_id,
          (adminCounts.get(row.school_id) ?? 0) + 1,
        );
      }

      return (data as School[]).map((school): SchoolRow => {
        const states = resolveModuleStates(modulesBySchool.get(school.id));
        return {
          ...school,
          adminCount: adminCounts.get(school.id) ?? 0,
          modulesOn:
            modulesKnown && !modulesErr
              ? MODULES.filter((m) => m.available && states[m.key]).length
              : null,
        };
      });
    },
  });

  const counts = useMemo(
    () => ({
      toutes: schools.length,
      actives: schools.filter((s) => s.active).length,
      inactives: schools.filter((s) => !s.active).length,
      sans_admin: schools.filter((s) => s.adminCount === 0).length,
    }),
    [schools],
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return schools.filter((s) => {
      if (filter === "actives" && !s.active) return false;
      if (filter === "inactives" && s.active) return false;
      if (filter === "sans_admin" && s.adminCount > 0) return false;
      if (!q) return true;
      return normalize(
        [s.name, s.code, s.city, s.region].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [schools, query, filter]);

  const setField = (key: keyof SchoolFormFields, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptySchoolForm);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSchoolFormComplete(form)) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from("ecoles")
      .insert(formToSchoolPayload(form));
    setSubmitting(false);

    if (error) {
      toast.error(
        error.message.includes("duplicate") || error.code === "23505"
          ? "Ce code d'école existe déjà"
          : "Impossible de créer l'école",
      );
      return;
    }

    toast.success("École créée");
    closeForm();
    void qc.invalidateQueries({ queryKey: ["ecoles"] });
  };

  return (
    <div>
      <AdminPageHeader
        title="Écoles"
        subtitle={
          isLoading
            ? "Créer et gérer les établissements"
            : `${counts.toutes} établissements · ${counts.actives} actifs · ${counts.sans_admin} sans administrateur`
        }
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle école
          </Button>
        }
      />

      {showForm ? (
        <Modal
          open={showForm}
          title="Nouvelle école"
          onClose={closeForm}
          closeDisabled={submitting}
          size="lg"
        >
          <p className="mb-4 text-sm text-slate-500">
            Tous les champs sont obligatoires.
          </p>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <SchoolFieldsForm form={form} onChange={setField} idPrefix="new" />
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Création…" : "Créer l’école"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                Annuler
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SearchField
          id="ecoles-search"
          value={query}
          onChange={setQuery}
          placeholder="Rechercher par nom, code ou ville"
          className="w-full lg:max-w-sm"
        />
        <div
          role="tablist"
          aria-label="Filtrer les écoles"
          className="flex overflow-x-auto rounded-md border border-slate-200 bg-white p-0.5 text-sm"
        >
          {(
            [
              ["toutes", "Toutes"],
              ["actives", "Actives"],
              ["inactives", "Inactives"],
              ["sans_admin", "Sans administrateur"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "whitespace-nowrap rounded-sm px-3 py-1.5 transition",
                filter === key
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
              <span
                className={cn(
                  "ml-1.5 tabular-nums",
                  filter === key ? "text-white/70" : "text-slate-400",
                )}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <AdminCard className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_7rem_6rem_1rem] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 md:grid">
          <span>École</span>
          <span>Type</span>
          <span>Ville</span>
          <span>Admins</span>
          <span>Modules</span>
          <span>Statut</span>
          <span />
        </div>
        {isLoading ? (
          <AdminLoading />
        ) : visible.length === 0 ? (
          <AdminEmpty
            message={
              schools.length === 0
                ? "Aucune école enregistrée."
                : "Aucune école ne correspond à cette recherche."
            }
          />
        ) : (
          <ul>
            {visible.map((s) => (
              <SchoolListRow key={s.id} school={s} />
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}

function SchoolListRow({ school: s }: { school: SchoolRow }) {
  const place = [s.city, s.region].filter(Boolean).join(" · ");
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <Link
        to={`/admin/ecoles/${s.id}`}
        className="group flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-slate-50 md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_7rem_7rem_6rem_1rem] md:items-center md:gap-4"
      >
        <span className="min-w-0">
          <span
            className="block truncate text-sm text-slate-900"
            title={s.name}
          >
            {s.name}
          </span>
          {s.code ? (
            <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-400">
              {s.code}
            </span>
          ) : null}
          <span className="mt-1 block truncate text-xs text-slate-500 md:hidden">
            {[
              s.school_type ? schoolTypeLabel(s.school_type) : null,
              place || null,
              s.adminCount > 0
                ? `${s.adminCount} admin${s.adminCount > 1 ? "s" : ""}`
                : "Aucun administrateur",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="hidden md:block truncate text-sm text-slate-600">
          {s.school_type ? schoolTypeLabel(s.school_type) : <Missing />}
        </span>
        <span className="hidden md:block truncate text-sm text-slate-600">
          {place || <Missing />}
        </span>
        <span className="hidden md:block text-sm">
          {s.adminCount > 0 ? (
            <span className="tabular-nums text-slate-700">{s.adminCount}</span>
          ) : (
            <AdminStatusDot tone="warning" label="Aucun" />
          )}
        </span>
        <span className="hidden md:block text-sm tabular-nums text-slate-600">
          {s.modulesOn == null ? (
            <Missing />
          ) : (
            <>
              {s.modulesOn}
              <span className="text-slate-400"> / {AVAILABLE_MODULES}</span>
            </>
          )}
        </span>
        <span className="shrink-0">
          <AdminStatusDot
            tone={s.active ? "success" : "danger"}
            label={s.active ? "Active" : "Inactive"}
          />
        </span>
        <ChevronRight
          className="hidden h-4 w-4 text-slate-300 transition group-hover:text-slate-500 md:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function Missing() {
  return <span className="text-slate-300">Non renseigné</span>;
}
