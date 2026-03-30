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
  const validWeights = entries
    .filter(
      (entry) =>
        entry.weight !== null &&
        entry.weight !== undefined &&
        (!anchorDate || entry.date <= anchorDate),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => entry.weight as number);

  if (!validWeights.length) {
    return null;
  }

  let smoothed = validWeights[0];
  for (let index = 1; index < validWeights.length; index += 1) {
    const next = validWeights[index];
    smoothed = smoothed * 0.72 + next * 0.28;
  }

  return Math.round(smoothed * 10) / 10;
}
