import { useSearchParams } from "react-router-dom";

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Page number and page size kept in the URL (`?page=2&taille=25`), so a list can be
 * shared, reloaded and reached again with the browser's back button.
 */
export function usePageParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const pageRaw = Number(searchParams.get("page"));
  const page = Number.isInteger(pageRaw) && pageRaw > 1 ? pageRaw : 1;
  const sizeRaw = Number(searchParams.get("taille"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeRaw)
    ? sizeRaw
    : DEFAULT_PAGE_SIZE;

  const setPage = (value: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value > 1) next.set("page", String(value));
        else next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  const setPageSize = (value: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value !== DEFAULT_PAGE_SIZE) next.set("taille", String(value));
        else next.delete("taille");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  return { page, pageSize, setPage, setPageSize };
}
