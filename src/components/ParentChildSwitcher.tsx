import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useParentChildren } from "@/hooks/useParentHome";
import { writeSelectedChild } from "@/lib/parentHome";
import { cn, personName } from "@/lib/utils";

/**
 * Compact « Awa · 6e A ▾ » chip. Swaps the child id in the current route
 * so a parent can change sibling without going back through the menu.
 * Hidden when the parent has fewer than two children.
 */
export function ParentChildSwitcher() {
  const { user, role } = useAuth();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: children } = useParentChildren(role === "parent" ? user?.id : undefined);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = children ?? [];
  const current = list.find((child) => child.id === id);
  if (!current || list.length < 2) return null;

  const label = [current.first_name, current.className].filter(Boolean).join(" · ");

  const select = (childId: string) => {
    setOpen(false);
    if (childId === id) return;
    writeSelectedChild(childId);
    const nextPath = location.pathname.replace(
      /^\/enfants\/[^/]+/,
      () => `/enfants/${childId}`,
    );
    navigate(`${nextPath}${location.search}${location.hash}`);
  };

  return (
    <div ref={rootRef} className="relative mt-2 inline-block max-w-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Changer d’enfant, ${label}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-bold text-slate-900 shadow-sm dark:border-slate-600 dark:bg-[var(--surface)] dark:text-slate-100"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
          {(current.first_name?.[0] ?? "?").toUpperCase()}
        </span>
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Choisir un enfant"
          className="absolute left-0 z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-[var(--surface)]"
        >
          {list.map((child) => {
            const selected = child.id === id;
            return (
              <button
                key={child.id}
                type="button"
                role="menuitem"
                onClick={() => select(child.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left",
                  selected
                    ? "bg-brand-50 dark:bg-brand-950/40"
                    : "hover:bg-slate-50 dark:hover:bg-[var(--surface-2)]",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
                  {(child.first_name?.[0] ?? "?").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {personName(child.first_name, child.last_name)}
                  </span>
                  {child.className ? (
                    <span className="block truncate text-xs text-slate-500">
                      {child.className}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
