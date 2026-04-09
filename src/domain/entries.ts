import type { AppLocale, DailyEntry } from "../types";

export function resolvedDailyCalories(entry: DailyEntry) {
  if (entry.manualCalories !== null && entry.manualCalories !== undefined) {
    return entry.manualCalories;
  }

  if (entry.analysisStale) {
    return null;
  }

  return entry.nutritionSnapshot?.calories ?? null;
}

export function chartDayTimestamp(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0).getTime();
}

export function findEntryByDate(entries: DailyEntry[], date: string) {
  return entries.find((entry) => entry.date === date);
}

export function dailyEntryDraft(entry: DailyEntry | undefined) {
  return {
    foodLogText: entry?.foodLogText ?? "",
    weight: entry?.weight !== null && entry?.weight !== undefined ? String(entry.weight) : "",
  };
}

export function formatEntryDate(
  date: string,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", options).format(value);
}

export function deducedWeightFromEntries(entries: DailyEntry[], anchorDate?: string) {
  // If weight is missing for a given day, use the most recent known weight (no smoothing).
  const lastKnown = entries
    .filter(
      (entry) =>
        entry.weight !== null &&
        entry.weight !== undefined &&
        (!anchorDate || entry.date <= anchorDate),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.weight;

  if (lastKnown == null) return null;
  return Math.round((lastKnown as number) * 10) / 10;
}

export function deducedCustomTdeeFromEntries(entries: DailyEntry[], anchorDate?: string) {
  // If custom TDEE is missing for a given day, use the most recent known custom TDEE.
  const lastKnown = entries
    .filter(
      (entry) =>
        entry.customTdee !== null &&
        entry.customTdee !== undefined &&
        (!anchorDate || entry.date <= anchorDate),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.customTdee;

  if (lastKnown == null) return null;
  return Math.round((lastKnown as number) * 1) / 1;
}
