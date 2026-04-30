import { computed, ref } from "vue";
import type { StoredAiKeys } from "../ai/credentials";

type SaveScope = string | string[];

type SaveSpec = {
  fieldKey: string;
  queueKey?: string;
  scopes: SaveScope;
  save: () => Promise<boolean>;
  shouldSave?: () => boolean;
};

type SaveEntry = {
  spec: SaveSpec;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: boolean;
  promise: Promise<boolean> | null;
};

type SaveControllerOptions = {
  debounceMs?: number;
  onChanged: (scopes: string[]) => Promise<void> | void;
};

function toScopeList(scopes: SaveScope) {
  return Array.isArray(scopes) ? scopes : [scopes];
}

export function useSaveController(options: SaveControllerOptions) {
  const debounceMs = options.debounceMs ?? 2000;
  const savingFields = ref<Record<string, boolean>>({});
  const entries = new Map<string, SaveEntry>();
  const activeSaves = ref(0);
  let tail: Promise<void> = Promise.resolve();

  const isAutoSaving = computed(() => activeSaves.value > 0);
  const isSavingWeight = computed(() => Boolean(savingFields.value["today.weight"]));
  const isSavingFoodLog = computed(() => Boolean(savingFields.value["today.foodLog"]));
  const isSavingFoodInstructions = computed(() =>
    Boolean(savingFields.value["constants.foodInstructions"]),
  );
  const isSavingTdeeEquation = computed(() =>
    Boolean(savingFields.value["constants.profile.tdeeEquation"]),
  );
  const isSavingLocale = computed(() => Boolean(savingFields.value["settings.locale"]));
  const isSavingProvider = computed(() => Boolean(savingFields.value["settings.provider"]));
  const savingAiKeyField = computed<keyof StoredAiKeys | "">(() => {
    const key = Object.keys(savingFields.value).find((item) => item.startsWith("credentials."));
    return key ? (key.replace("credentials.", "") as keyof StoredAiKeys) : "";
  });
  const savingHistoryCalories = computed<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(savingFields.value)
        .filter(([key, value]) => key.startsWith("history.calories.") && value)
        .map(([key]) => [key.replace("history.calories.", ""), true]),
    ),
  );
  const savingHistoryWeight = computed<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(savingFields.value)
        .filter(([key, value]) => key.startsWith("history.weight.") && value)
        .map(([key]) => [key.replace("history.weight.", ""), true]),
    ),
  );

  function setSaving(fieldKey: string, saving: boolean) {
    if (saving) {
      savingFields.value = { ...savingFields.value, [fieldKey]: true };
      return;
    }

    const next = { ...savingFields.value };
    delete next[fieldKey];
    savingFields.value = next;
  }

  function enqueue<T>(task: () => Promise<T>) {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function entryKey(spec: Pick<SaveSpec, "fieldKey" | "queueKey">) {
    return spec.queueKey ?? spec.fieldKey;
  }

  function getOrCreateEntry(spec: SaveSpec) {
    const key = entryKey(spec);
    const existing = entries.get(key);
    if (existing) {
      existing.spec = spec;
      return existing;
    }

    const entry: SaveEntry = {
      spec,
      timer: null,
      running: false,
      pending: false,
      promise: null,
    };
    entries.set(key, entry);
    return entry;
  }

  function clearTimer(entry: SaveEntry) {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  function cancel(fieldKey: string) {
    const entry = entries.get(fieldKey);
    if (!entry || entry.running) return;
    clearTimer(entry);
    entry.pending = false;
    entry.promise = null;
  }

  function shouldSkip(spec: SaveSpec) {
    return spec.shouldSave ? !spec.shouldSave() : false;
  }

  function schedule(spec: SaveSpec, delayMs = debounceMs) {
    if (shouldSkip(spec)) {
      cancel(entryKey(spec));
      return Promise.resolve(false);
    }

    const key = entryKey(spec);
    const entry = getOrCreateEntry(spec);
    clearTimer(entry);
    entry.pending = true;
    entry.timer = setTimeout(() => {
      void flush(key);
    }, delayMs);
    return entry.promise ?? Promise.resolve(false);
  }

  async function flush(fieldKey: string) {
    const entry = entries.get(fieldKey);
    if (!entry) return false;
    clearTimer(entry);

    if (entry.running) {
      entry.pending = true;
      return entry.promise ?? Promise.resolve(false);
    }

    entry.promise = enqueue(async () => {
      entry.running = true;
      let anyChanged = false;
      const savingKey = entry.spec.fieldKey;
      activeSaves.value += 1;
      setSaving(savingKey, true);
      try {
        do {
          entry.pending = false;
          const spec = entry.spec;
          if (shouldSkip(spec)) {
            continue;
          }

          const changed = await spec.save();
          if (changed) {
            anyChanged = true;
            await options.onChanged(toScopeList(spec.scopes));
          }
        } while (entry.pending);
      } finally {
        entry.running = false;
        entry.promise = null;
        activeSaves.value = Math.max(0, activeSaves.value - 1);
        setSaving(savingKey, false);
      }

      return anyChanged;
    }) as Promise<boolean>;

    return entry.promise;
  }

  async function runNow(spec: SaveSpec) {
    schedule(spec, 0);
    return flush(entryKey(spec));
  }

  async function flushAll() {
    const keys = Array.from(entries.keys());
    const results = await Promise.all(keys.map((key) => flush(key)));
    return results.some(Boolean);
  }

  return {
    isAutoSaving,
    isSavingWeight,
    isSavingFoodLog,
    isSavingFoodInstructions,
    isSavingTdeeEquation,
    isSavingLocale,
    isSavingProvider,
    savingAiKeyField,
    savingHistoryCalories,
    savingHistoryWeight,
    schedule,
    runNow,
    flush,
    flushAll,
    cancel,
  };
}
