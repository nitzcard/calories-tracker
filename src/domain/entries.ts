import type { AppLocale, DailyEntry } from "../types";

export function resolvedDailyCalories(entry: DailyEntry) {
  if (entry.manualCalories !== null && entry.manualCalories !== undefined) {
    return entry.manualCalories;
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

export function deducedWeightFromEntries(
  entries: DailyEntry[],
  anchorDate?: string,
) {
  const normalizedAnchorDate = anchorDate
    ?? [...entries].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date;

  if (!normalizedAnchorDate) {
    return null;
  }

  const weightedEntries = entries
    .filter((entry) => entry.weight !== null && entry.weight !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));

  const exactLogged = weightedEntries.find((entry) => entry.date === normalizedAnchorDate)?.weight;
  if (exactLogged != null) {
    return Math.round(exactLogged * 10) / 10;
  }

  const previous = weightedEntries.filter((entry) => entry.date < normalizedAnchorDate).at(-1);
  const previousWeight = previous?.weight;
  if (previousWeight == null) return null;
  return Math.round(previousWeight * 10) / 10;
}
