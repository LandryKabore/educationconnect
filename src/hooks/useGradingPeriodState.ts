import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ANNUAL_PERIOD_LABEL } from "@/lib/averages";
import { trimesterRanges } from "@/lib/attendancePeriods";
import {
  initialGradingPeriod,
  pickDefaultPeriod,
  readStoredGradingPeriod,
  writeStoredGradingPeriod,
  type PeriodRange,
} from "@/lib/gradingPeriod";
import { supabase } from "@/lib/supabase";

type YearRow = { id: string; start_date: string; end_date: string };
type PeriodRow = {
  label: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

async function loadYear(opts: {
  classSectionId?: string | null;
  schoolId?: string | null;
}): Promise<YearRow | null> {
  if (opts.classSectionId) {
    const { data: cls, error } = await supabase
      .from("classes")
      .select("academic_year_id")
      .eq("id", opts.classSectionId)
      .maybeSingle();
    if (error) throw error;
    const yearId = (cls as { academic_year_id: string | null } | null)
      ?.academic_year_id;
    if (yearId) {
      const { data: year, error: yearError } = await supabase
        .from("annees_scolaires")
        .select("id, start_date, end_date")
        .eq("id", yearId)
        .maybeSingle();
      if (yearError) throw yearError;
      if (year) return year as YearRow;
    }
  }
  if (!opts.schoolId) return null;
  const { data: year, error } = await supabase
    .from("annees_scolaires")
    .select("id, start_date, end_date")
    .eq("school_id", opts.schoolId)
    .eq("is_current", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (year as YearRow | null) ?? null;
}

/**
 * Closed state and date ranges for the class's year, or the school's current year.
 * Closure is `periodes_scolaires.status = 'cloturee'`. Dates fall back to the
 * three equal slices of the school year, same as the database.
 */
export function useGradingPeriodFacts(opts: {
  classSectionId?: string | null;
  schoolId?: string | null;
}) {
  const classSectionId = opts.classSectionId || null;
  const schoolId = opts.schoolId || null;
  return useQuery({
    queryKey: ["grading-period-facts", classSectionId, schoolId],
    enabled: Boolean(classSectionId || schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const year = await loadYear({ classSectionId, schoolId });
      if (!year) return { year: null, rows: [] as PeriodRow[] };
      const { data, error } = await supabase
        .from("periodes_scolaires")
        .select("label, status, start_date, end_date")
        .eq("academic_year_id", year.id);
      if (error) throw error;
      return { year, rows: (data ?? []) as unknown as PeriodRow[] };
    },
  });
}

function factsToChoice(
  labels: readonly string[],
  year: YearRow | null,
  rows: PeriodRow[],
) {
  const closed = new Set(
    rows.filter((row) => row.status === "cloturee").map((row) => row.label),
  );
  const ranges: Record<string, PeriodRange> = {};
  if (year) {
    const custom = rows.map((row) => ({
      label: row.label,
      start_date: row.start_date,
      end_date: row.end_date,
    }));
    for (const slice of trimesterRanges(year, custom)) {
      ranges[slice.label] = { start: slice.from, end: slice.to };
    }
    ranges[ANNUAL_PERIOD_LABEL] = {
      start: year.start_date,
      end: year.end_date,
    };
  }
  for (const row of rows) {
    if (row.start_date && row.end_date) {
      ranges[row.label] = { start: row.start_date, end: row.end_date };
    }
  }
  return { closed, ranges, labels };
}

export function useResolvedGradingPeriod(
  labels: readonly string[],
  opts: {
    explicit?: string | null;
    classSectionId?: string | null;
    schoolId?: string | null;
  },
) {
  const facts = useGradingPeriodFacts(opts);
  const explicit =
    opts.explicit && labels.includes(opts.explicit) ? opts.explicit : null;
  const stored = readStoredGradingPeriod(labels);
  const ready = explicit != null || !facts.isLoading;
  const suggested = useMemo(() => {
    if (!ready || !facts.data) {
      return explicit ?? initialGradingPeriod(labels, opts.explicit);
    }
    const choice = factsToChoice(labels, facts.data.year, facts.data.rows);
    return pickDefaultPeriod({
      labels,
      closed: choice.closed,
      ranges: choice.ranges,
      stored,
      explicit,
    });
  }, [ready, facts.data, labels, stored, explicit, opts.explicit]);
  const closedLabels = useMemo(() => {
    const rows = facts.data?.rows ?? [];
    return new Set(
      rows.filter((row) => row.status === "cloturee").map((row) => row.label),
    );
  }, [facts.data]);
  return { suggested, closedLabels, ready };
}

/**
 * Period dropdown state. The automatic value skips a closed trimester;
 * choosing a closed period in the list is kept for the rest of the visit.
 */
export function useGradingPeriodState(
  labels: readonly string[],
  opts: {
    explicit?: string | null;
    classSectionId?: string | null;
    schoolId?: string | null;
  },
) {
  const { suggested, closedLabels, ready } = useResolvedGradingPeriod(
    labels,
    opts,
  );
  const explicit =
    opts.explicit && labels.includes(opts.explicit) ? opts.explicit : null;
  const [period, setPeriod] = useState(
    () => explicit ?? initialGradingPeriod(labels),
  );
  const touched = useRef(explicit != null);

  useEffect(() => {
    if (!ready || touched.current) return;
    setPeriod(suggested);
  }, [ready, suggested]);

  const selectPeriod = (next: string) => {
    touched.current = true;
    setPeriod(next);
    writeStoredGradingPeriod(next);
  };

  return { period, selectPeriod, closedLabels, ready };
}
