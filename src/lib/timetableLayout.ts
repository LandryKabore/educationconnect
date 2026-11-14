import { timeToMinutes } from "@/lib/timetableConflicts";

export const PX_PER_MIN = 1.35;
export const PAUSE_BAND_PX = 40;
/** Space above the first hour so cards don't sit on the day header. */
export const HEADER_PAD = 14;
/** Space below the last hour mark. */
export const BOTTOM_PAD = 22;
/** Empty stretch with no lesson on any visible day, collapsed into a pause band. */
export const PAUSE_GAP_MIN = 120;

const DEFAULT_START_MIN = 7 * 60;
const DEFAULT_END_MIN = 15 * 60;

/** "3" → "Salle 3", "Salle 3" stays, "Labo" / "Terrain" stay as written. */
export function formatRoomLabel(room: string | null | undefined): string | null {
  const trimmed = room?.trim() ?? "";
  if (!trimmed) return null;
  if (/^salle\b/i.test(trimmed)) return trimmed;
  if (/^\d/.test(trimmed)) return `Salle ${trimmed}`;
  return trimmed;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "7h", "7h30". Axis and card times; keep formatClock for forms and PDFs. */
export function formatHourShort(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** "7h – 9h" from "HH:MM" / "HH:MM:SS" or minutes past midnight. */
export function formatRangeFr(
  start: string | number,
  end: string | number,
): string {
  const startMin = typeof start === "string" ? timeToMinutes(start) : start;
  const endMin = typeof end === "string" ? timeToMinutes(end) : end;
  return `${formatHourShort(startMin)} – ${formatHourShort(endMin)}`;
}

export function formatPauseLabel(startMin: number, endMin: number): string {
  return `Pause · ${formatHourShort(startMin)} – ${formatHourShort(endMin)}`;
}

/** "9 h", "1 h 30", "45 min". */
export function formatHoursFr(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return m === 0 ? "0 h" : `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function snapDown15(minutes: number): number {
  return Math.floor(minutes / 15) * 15;
}

export function snapUp15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

export type PauseBand = { startMin: number; endMin: number };

export type TimeRegion = {
  kind: "scale" | "pause";
  startMin: number;
  endMin: number;
  y: number;
  height: number;
};

export type TimeScale = {
  rangeStart: number;
  rangeEnd: number;
  pauses: PauseBand[];
  regions: TimeRegion[];
  height: number;
  minuteToY: (minutes: number) => number;
  hourMarks: number[];
  halfHourMarks: number[];
};

type SlotTime = { start_time: string; end_time: string };

function slotInterval(slot: SlotTime): [number, number] | null {
  const start = timeToMinutes(slot.start_time);
  const end = timeToMinutes(slot.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return [start, end];
}

export function timetableBounds(slots: SlotTime[]): {
  rangeStart: number;
  rangeEnd: number;
} {
  let min = Infinity;
  let max = -Infinity;
  for (const slot of slots) {
    const interval = slotInterval(slot);
    if (!interval) continue;
    min = Math.min(min, interval[0]);
    max = Math.max(max, interval[1]);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { rangeStart: DEFAULT_START_MIN, rangeEnd: DEFAULT_END_MIN };
  }
  return {
    rangeStart: Math.floor(min / 60) * 60,
    rangeEnd: Math.max(Math.ceil(max / 60) * 60, Math.floor(min / 60) * 60 + 60),
  };
}

/** Interior gaps of at least `gapMin` where nothing is scheduled. */
export function findPauseBands(
  slots: SlotTime[],
  rangeStart: number,
  rangeEnd: number,
  gapMin = PAUSE_GAP_MIN,
): PauseBand[] {
  const merged: [number, number][] = [];
  const intervals = slots
    .map(slotInterval)
    .filter((interval): interval is [number, number] => interval != null)
    .map(([start, end]) => [
      Math.max(rangeStart, start),
      Math.min(rangeEnd, end),
    ] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1]) merged.push([start, end]);
    else last[1] = Math.max(last[1], end);
  }

  const pauses: PauseBand[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const startMin = merged[i][1];
    const endMin = merged[i + 1][0];
    if (endMin - startMin >= gapMin) pauses.push({ startMin, endMin });
  }
  return pauses;
}

export function buildTimeScale(args: {
  rangeStart: number;
  rangeEnd: number;
  pauses: PauseBand[];
  pxPerMin: number;
  pausePx: number;
}): TimeScale {
  const { rangeStart, rangeEnd, pauses, pxPerMin, pausePx } = args;
  const regions: TimeRegion[] = [];
  let cursor = rangeStart;
  let y = HEADER_PAD;

  const ordered = [...pauses].sort((a, b) => a.startMin - b.startMin);
  for (const pause of ordered) {
    const startMin = Math.max(rangeStart, pause.startMin);
    const endMin = Math.min(rangeEnd, pause.endMin);
    if (endMin <= startMin) continue;
    if (startMin > cursor) {
      const height = (startMin - cursor) * pxPerMin;
      regions.push({
        kind: "scale",
        startMin: cursor,
        endMin: startMin,
        y,
        height,
      });
      y += height;
    }
    regions.push({
      kind: "pause",
      startMin,
      endMin,
      y,
      height: pausePx,
    });
    y += pausePx;
    cursor = endMin;
  }
  if (cursor < rangeEnd) {
    const height = (rangeEnd - cursor) * pxPerMin;
    regions.push({
      kind: "scale",
      startMin: cursor,
      endMin: rangeEnd,
      y,
      height,
    });
    y += height;
  }

  const height = Math.max(y, 60) + BOTTOM_PAD;

  const minuteToY = (minutes: number) => {
    const clamped = Math.min(rangeEnd, Math.max(rangeStart, minutes));
    for (const region of regions) {
      if (clamped < region.startMin || clamped > region.endMin) continue;
      if (clamped === region.endMin && region.kind === "pause") continue;
      if (region.kind === "pause") {
        const span = region.endMin - region.startMin || 1;
        return region.y + ((clamped - region.startMin) / span) * region.height;
      }
      return region.y + (clamped - region.startMin) * pxPerMin;
    }
    return height;
  };

  const covered = ordered.map((pause) => ({
    startMin: Math.max(rangeStart, pause.startMin),
    endMin: Math.min(rangeEnd, pause.endMin),
  }));
  const hourMarks: number[] = [];
  for (let m = rangeStart; m <= rangeEnd; m += 60) {
    // Hide the tick that sits on the top edge of a pause — the band names that time.
    const inside = covered.some(
      (pause) => m >= pause.startMin && m < pause.endMin,
    );
    if (!inside) hourMarks.push(m);
  }

  const halfHourMarks: number[] = [];
  for (let m = rangeStart + 30; m < rangeEnd; m += 60) {
    const inside = covered.some(
      (pause) => m > pause.startMin && m < pause.endMin,
    );
    if (!inside) halfHourMarks.push(m);
  }

  return {
    rangeStart,
    rangeEnd,
    pauses: covered.filter((pause) => pause.endMin > pause.startMin),
    regions,
    height,
    minuteToY,
    hourMarks,
    halfHourMarks,
  };
}

export function layoutTimetable(
  slots: SlotTime[],
  options?: { pxPerMin?: number; pausePx?: number; gapMin?: number },
): TimeScale {
  const bounds = timetableBounds(slots);
  const pauses = findPauseBands(
    slots,
    bounds.rangeStart,
    bounds.rangeEnd,
    options?.gapMin ?? PAUSE_GAP_MIN,
  );
  return buildTimeScale({
    ...bounds,
    pauses,
    pxPerMin: options?.pxPerMin ?? PX_PER_MIN,
    pausePx: options?.pausePx ?? PAUSE_BAND_PX,
  });
}

/** Hour cells an admin can click. Skips time swallowed by a pause band. */
export function clickableHours(scale: TimeScale): {
  startMin: number;
  top: number;
  height: number;
}[] {
  const blocks: { startMin: number; top: number; height: number }[] = [];
  for (let m = scale.rangeStart; m < scale.rangeEnd; m += 60) {
    const hourEnd = Math.min(m + 60, scale.rangeEnd);
    const pause = scale.pauses.find(
      (band) => band.startMin < hourEnd && band.endMin > m,
    );
    let visStart = m;
    let visEnd = hourEnd;
    if (pause) {
      if (pause.startMin <= m && pause.endMin >= hourEnd) continue;
      if (pause.startMin <= m) visStart = pause.endMin;
      else visEnd = pause.startMin;
    }
    if (visEnd - visStart < 8) continue;
    const top = scale.minuteToY(visStart);
    const height = scale.minuteToY(visEnd) - top;
    if (height < 8) continue;
    blocks.push({ startMin: visStart, top, height });
  }
  return blocks;
}

export function freeRangesOnDay(
  busy: SlotTime[],
  windowStart: number,
  windowEnd: number,
  minGap = 30,
): { startMin: number; endMin: number }[] {
  const merged: [number, number][] = [];
  const intervals = busy
    .map(slotInterval)
    .filter((interval): interval is [number, number] => interval != null)
    .map(([start, end]) => [
      Math.max(windowStart, start),
      Math.min(windowEnd, end),
    ] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1]) merged.push([start, end]);
    else last[1] = Math.max(last[1], end);
  }

  const free: { startMin: number; endMin: number }[] = [];
  let cursor = windowStart;
  for (const [start, end] of merged) {
    if (start - cursor >= minGap) free.push({ startMin: cursor, endMin: start });
    cursor = Math.max(cursor, end);
  }
  if (windowEnd - cursor >= minGap) free.push({ startMin: cursor, endMin: windowEnd });
  return free;
}

export function plannedMinutesBySubject(
  slots: (SlotTime & { subjectName: string })[],
): { name: string; minutes: number }[] {
  const totals = new Map<string, number>();
  for (const slot of slots) {
    const interval = slotInterval(slot);
    if (!interval) continue;
    const name = slot.subjectName.trim() || "Matière";
    totals.set(name, (totals.get(name) ?? 0) + (interval[1] - interval[0]));
  }
  return [...totals.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort(
      (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "fr"),
    );
}
