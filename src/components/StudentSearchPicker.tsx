import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { searchStudentsForPicker } from "@/lib/scaleApi";
import { cn, fullName, matchesSearch } from "@/lib/utils";
import { Input } from "@/components/ui";

export type StudentOption = {
  id: string;
  first_name: string;
  last_name: string;
  className?: string | null;
  phone?: string | null;
};

type Props = {
  /** Fixed list (small schools). Ignored when `schoolId` is given. */
  students?: StudentOption[];
  /** When set, the box searches the school's students in the database as you type. */
  schoolId?: string;
  value: string;
  onChange: (studentId: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Shown when `value` is set before a search result is loaded (deep link). */
  selectedOption?: StudentOption | null;
};

export function StudentSearchPicker({
  students: studentsProp,
  schoolId,
  value,
  onChange,
  required,
  disabled,
  placeholder = "Rechercher un élève (nom, classe…)",
  selectedOption = null,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const serverMode = !!schoolId;
  const debouncedQuery = useDebouncedValue(query, 250);
  const { data: remote, isFetching } = useQuery({
    queryKey: ["student-picker", schoolId, debouncedQuery],
    enabled: serverMode && open,
    queryFn: () => searchStudentsForPicker(schoolId!, debouncedQuery, 40),
    staleTime: 15_000,
  });
  const students = useMemo<StudentOption[]>(
    () => (serverMode ? (remote ?? []) : (studentsProp ?? [])),
    [serverMode, remote, studentsProp],
  );
  const [picked, setPicked] = useState<StudentOption | null>(null);

  const selected = useMemo(
    () =>
      students.find((s) => s.id === value) ??
      (picked && picked.id === value ? picked : null) ??
      (selectedOption && selectedOption.id === value ? selectedOption : null),
    [students, value, picked, selectedOption],
  );

  const filtered = useMemo(() => {
    if (serverMode) return students;
    const list = students.filter((s) =>
      matchesSearch(query, s.first_name, s.last_name, s.className, s.phone),
    );
    return list
      .slice()
      .sort((a, b) =>
        fullName(a.first_name, a.last_name).localeCompare(
          fullName(b.first_name, b.last_name),
          "fr",
        ),
      )
      .slice(0, 80);
  }, [students, query, serverMode]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (selected) setQuery("");
  }, [selected]);

  return (
    <div ref={rootRef} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {fullName(selected.first_name, selected.last_name)}
            </p>
            {selected.className ? (
              <p className="truncate text-xs text-slate-500">
                {selected.className}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={disabled}
            className="shrink-0 text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
          >
            Changer
          </button>
        </div>
      ) : (
        <>
          <Input
            value={query}
            disabled={disabled || (!serverMode && students.length === 0)}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            autoComplete="off"
            required={required && !value}
          />
          {open && (serverMode || students.length > 0) ? (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400">
                  {serverMode && isFetching ? "Recherche…" : "Aucun élève trouvé"}
                </p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-brand-50",
                      value === s.id && "bg-brand-50",
                    )}
                    onClick={() => {
                      setPicked(s);
                      onChange(s.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="font-medium text-slate-900">
                      {fullName(s.first_name, s.last_name)}
                    </span>
                    {s.className ? (
                      <span className="text-xs text-slate-500">{s.className}</span>
                    ) : null}
                  </button>
                ))
              )}
              {(serverMode ? filtered.length >= 40 : students.length > 80 && filtered.length >= 80) ? (
                <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
                  Affinez la recherche pour voir plus d’élèves
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {/* Keep required validation for native form submit */}
      <input type="hidden" value={value} required={required} readOnly />
    </div>
  );
}
