type TemporalLike = {
  Now?: {
    timeZoneId?: () => string;
    zonedDateTimeISO?: (timeZoneId?: string) => {
      hour: number;
      subtract: (duration: { days: number }) => { toPlainDate: () => { toString: () => string } };
      toPlainDate: () => { toString: () => string };
    };
  };
  Instant?: {
    fromEpochMilliseconds?: (ms: number) => {
      toZonedDateTimeISO: (timeZoneId?: string) => {
        hour: number;
        subtract: (duration: { days: number }) => { toPlainDate: () => { toString: () => string } };
        toPlainDate: () => { toString: () => string };
      };
    };
  };
} | undefined;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function temporalGlobal(): TemporalLike {
  return (globalThis as any).Temporal as TemporalLike;
}

function formatIsoDateParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function toUtcDayStamp(isoDate: string) {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function shiftEarlyMorning(date: Date) {
  const shifted = new Date(date.getTime());
  if (shifted.getHours() < 6) {
    shifted.setDate(shifted.getDate() - 1);
  }
  return shifted;
}

export function compareIsoDates(left: string, right: string) {
  const delta = toUtcDayStamp(left) - toUtcDayStamp(right);
  if (delta === 0) return 0;
  return delta < 0 ? -1 : 1;
}

export function diffIsoDays(fromIsoDate: string, toIsoDate: string) {
  return Math.round((toUtcDayStamp(toIsoDate) - toUtcDayStamp(fromIsoDate)) / DAY_MS);
}

export function localIsoDate(date = new Date()): string {
  const temporal = temporalGlobal();
  if (temporal?.Now?.zonedDateTimeISO && temporal?.Now?.timeZoneId && temporal?.Instant?.fromEpochMilliseconds) {
    const tz = temporal.Now.timeZoneId();
    const zoned = date
      ? temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(tz)
      : temporal.Now.zonedDateTimeISO(tz);
    const shifted = zoned.hour < 6 ? zoned.subtract({ days: 1 }) : zoned;
    return shifted.toPlainDate().toString();
  }

  const shifted = shiftEarlyMorning(date);
  return formatIsoDateParts(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
}
