/** Stable JSON compare for form dirty-checking. */
export function isFormDirty(current: unknown, baseline: unknown) {
  return JSON.stringify(current) !== JSON.stringify(baseline);
}
