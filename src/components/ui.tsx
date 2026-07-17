import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { formatFrDateInput, frToIso, isoToFr } from "@/lib/dateFr";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-sm",
        size === "lg" && "h-12 px-5",
        variant === "primary" && "bg-brand-700 text-white hover:bg-brand-800",
        variant === "secondary" &&
          "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white",
        variant === "outline" &&
          "border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-[var(--surface)] dark:hover:bg-[var(--surface-2)]",
        variant === "ghost" &&
          "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...props}
    />
  );
});

const FR_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const FR_DAYS = ["lu", "ma", "me", "je", "ve", "sa", "di"];

function parseIsoParts(iso: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Date field in JJ/MM/AAAA with an openable French calendar. ISO value in/out. */
export function DateInputFr({
  value,
  onChange,
  className,
  id,
  required,
  disabled,
  name,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
}) {
  const [text, setText] = React.useState(() => isoToFr(value));
  const [invalid, setInvalid] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const selected = parseIsoParts(value);
  const today = new Date();
  const [viewYear, setViewYear] = React.useState(
    () => selected?.y ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = React.useState(
    () => selected?.m ?? today.getMonth() + 1,
  );

  React.useEffect(() => {
    setText(isoToFr(value));
    setInvalid(false);
    const parts = parseIsoParts(value);
    if (parts) {
      setViewYear(parts.y);
      setViewMonth(parts.m);
    }
  }, [value]);

  React.useEffect(() => {
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

  const firstWeekday = (() => {
    // Monday = 0 … Sunday = 6
    const dow = new Date(viewYear, viewMonth - 1, 1).getDay();
    return dow === 0 ? 6 : dow - 1;
  })();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const pickDay = (day: number) => {
    const iso = toIso(viewYear, viewMonth, day);
    onChange(iso);
    setText(isoToFr(iso));
    setInvalid(false);
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          placeholder="jj/mm/aaaa"
          autoComplete="off"
          required={required}
          disabled={disabled}
          value={text}
          className={cn(
            "h-11 w-full rounded-xl border bg-white px-3 pr-11 outline-none focus:ring-2",
            invalid
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-slate-300 focus:border-brand-600 focus:ring-brand-100",
          )}
          onChange={(e) => {
            const next = formatFrDateInput(e.target.value);
            setText(next);
            if (next.length < 10) {
              setInvalid(false);
              if (!next) onChange("");
              return;
            }
            const iso = frToIso(next);
            if (iso) {
              setInvalid(false);
              onChange(iso);
            } else {
              setInvalid(true);
            }
          }}
          onBlur={() => {
            // Delay so calendar clicks register first
            window.setTimeout(() => {
              if (open) return;
              if (!text.trim()) {
                setInvalid(false);
                onChange("");
                return;
              }
              const iso = frToIso(text);
              if (iso) {
                setText(isoToFr(iso));
                setInvalid(false);
                onChange(iso);
              } else {
                setInvalid(true);
              }
            }, 150);
          }}
        />
        <button
          type="button"
          disabled={disabled}
          title="Ouvrir le calendrier"
          aria-label="Ouvrir le calendrier"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-brand-700 disabled:opacity-50"
          onClick={() => {
            if (!open && selected) {
              setViewYear(selected.y);
              setViewMonth(selected.m);
            } else if (!open) {
              setViewYear(today.getFullYear());
              setViewMonth(today.getMonth() + 1);
            }
            setOpen((v) => !v);
          }}
        >
          <Calendar className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-[19rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Mois précédent"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              aria-label="Mois"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1.5 text-sm font-medium capitalize text-slate-900 outline-none focus:border-brand-600"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
            >
              {FR_MONTHS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Année"
              className="w-[4.75rem] shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1.5 text-sm font-medium text-slate-900 outline-none focus:border-brand-600"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
            >
              {Array.from({ length: 31 }, (_, i) => today.getFullYear() - 10 + i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ),
              )}
            </select>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Mois suivant"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium uppercase text-slate-400">
            {FR_DAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const isSelected =
                selected?.y === viewYear &&
                selected?.m === viewMonth &&
                selected?.d === day;
              const isToday =
                today.getFullYear() === viewYear &&
                today.getMonth() + 1 === viewMonth &&
                today.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={cn(
                    "h-8 rounded-lg text-sm transition",
                    isSelected
                      ? "bg-brand-700 font-semibold text-white"
                      : isToday
                        ? "bg-brand-50 font-medium text-brand-800 hover:bg-brand-100"
                        : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              className="text-xs font-medium text-brand-700 hover:underline"
              onClick={() => {
                const iso = toIso(
                  today.getFullYear(),
                  today.getMonth() + 1,
                  today.getDate(),
                );
                onChange(iso);
                setText(isoToFr(iso));
                setInvalid(false);
                setOpen(false);
              }}
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:underline"
              onClick={() => {
                onChange("");
                setText("");
                setInvalid(false);
                setOpen(false);
              }}
            >
              Effacer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn(
          "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 pr-11 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
          className,
        )}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        tabIndex={-1}
      >
        {visible ? (
          <EyeOff className="h-[18px] w-[18px]" aria-hidden />
        ) : (
          <Eye className="h-[18px] w-[18px]" aria-hidden />
        )}
      </button>
    </div>
  );
});

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-slate-500">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-slate-500">
      {message}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "default" &&
          "bg-slate-100 text-slate-700 dark:bg-slate-600 dark:text-slate-100",
        tone === "success" &&
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-700 dark:text-emerald-50",
        tone === "warning" &&
          "bg-amber-100 text-amber-900 dark:bg-amber-600 dark:text-amber-50",
        tone === "danger" &&
          "bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-50",
        tone === "info" &&
          "bg-sky-100 text-sky-800 dark:bg-sky-700 dark:text-sky-50",
      )}
    >
      {children}
    </span>
  );
}
