export function localIsoDate(date?: Date): string {
  const temporal = (globalThis as any).Temporal as any;
  if (!temporal?.Now?.plainDateISO) {
    throw new Error("Temporal API is required but not available in this browser/runtime.");
  }

  const tz = temporal.Now.timeZoneId();
  const zoned = date
    ? temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(tz)
    : temporal.Now.zonedDateTimeISO(tz);
  // Treat late-night logging as part of the previous day until 06:00 local time.
  const shifted = zoned.hour < 6 ? zoned.subtract({ days: 1 }) : zoned;
  return shifted.toPlainDate().toString();
}
