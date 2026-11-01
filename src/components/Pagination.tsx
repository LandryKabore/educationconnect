import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "@/hooks/usePageParams";
import { cn } from "@/lib/utils";
import { Button, Select } from "@/components/ui";

/** Page numbers to show: first, last, and a window around the current page. */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...wanted]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

export function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  noun = "résultat",
  busy = false,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** Singular noun for the "n résultats" counter. */
  noun?: string;
  busy?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-700"
      aria-busy={busy}
    >
      <p>
        {from}–{to} sur {total} {noun}
        {total !== 1 ? "s" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageWindow(current, pageCount).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === current ? "page" : undefined}
              className={cn(
                "h-9 min-w-9 rounded-lg px-2 text-sm font-medium transition",
                n === current
                  ? "bg-brand-700 text-white"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--surface-2)]",
              )}
            >
              {n}
            </button>
          ),
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={current >= pageCount}
          onClick={() => onPage(current + 1)}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Select
          aria-label="Lignes par page"
          className="h-9 w-auto py-0 text-sm"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
