export function localIsoDate(date?: Date): string {
  const temporal = (globalThis as any).Temporal as any;
  if (!temporal?.Now?.plainDateISO) {
    throw new Error("Temporal API is required but not available in this browser/runtime.");
  }

  if (!date) {
    return temporal.Now.plainDateISO().toString();
  }

  const tz = temporal.Now.timeZoneId();
  return temporal.Instant
    .fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(tz)
    .toPlainDate()
    .toString();
}
