/** Format Postgres time "08:30:00" → "08:30". */
export function formatTimeHm(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 5);
}

export function formatExamSchedule(opts: {
  due_date: string | null;
  start_time?: string | null;
  end_time?: string | null;
}): string | null {
  if (!opts.due_date) return null;
  const start = formatTimeHm(opts.start_time);
  const end = formatTimeHm(opts.end_time);
  if (start && end) return `${start} – ${end}`;
  if (start) return `à partir de ${start}`;
  return null;
}
