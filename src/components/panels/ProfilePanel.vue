<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale, BiologicalSex, Profile } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  profile: Profile;
  estimatedLeanWeight: number | null;
  isSavingActivity: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "update:profile": [profile: Profile];
  save: [profile: Profile];
  "save-activity": [activityPrompt: string];
}>();

const activityDraft = ref(props.profile.activityPrompt);
const isProfileRequiredMissing = () =>
  props.profile.age == null || props.profile.height == null || !activityDraft.value.trim();

let profileSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let latestProfileToSave: Profile | null = null;
const PROFILE_SAVE_DEBOUNCE_MS = 2000;
let activitySaveTimeout: ReturnType<typeof setTimeout> | null = null;
let latestActivityToSave: string | null = null;

watch(
  () => props.profile.activityPrompt,
  (next) => {
    activityDraft.value = next;
  },
);

function scheduleProfileSave(nextProfile: Profile) {
  latestProfileToSave = nextProfile;
  if (profileSaveTimeout) clearTimeout(profileSaveTimeout);
  profileSaveTimeout = setTimeout(() => {
    if (!latestProfileToSave) return;
    emit("save", latestProfileToSave);
    profileSaveTimeout = null;
  }, PROFILE_SAVE_DEBOUNCE_MS);
}

function saveNullableNumber<K extends "age" | "height" | "estimatedWeight" | "targetWeight" | "bodyFat">(
  key: K,
  event: Event,
) {
  const raw = (event.target as HTMLInputElement).value;
  const nextProfile = { ...props.profile, [key]: raw ? Number(raw) : null };
  emit("update:profile", nextProfile);
  scheduleProfileSave(nextProfile);
}

function saveImmediateProfile(profile: Profile) {
  emit("update:profile", profile);
  if (profileSaveTimeout) {
    clearTimeout(profileSaveTimeout);
    profileSaveTimeout = null;
  }
  latestProfileToSave = profile;
  emit("save", profile);
}

function saveActivityProfile(nextPrompt: string) {
  const nextProfile = { ...props.profile, activityFactor: "inferred" as const, activityPrompt: nextPrompt };
  emit("update:profile", nextProfile);
  latestActivityToSave = nextPrompt;
  if (activitySaveTimeout) clearTimeout(activitySaveTimeout);
  activitySaveTimeout = setTimeout(() => {
    if (!latestActivityToSave) return;
    emit("save-activity", latestActivityToSave);
    activitySaveTimeout = null;
  }, PROFILE_SAVE_DEBOUNCE_MS);
}

function flushActivityProfile(nextPrompt: string) {
  const nextProfile = { ...props.profile, activityFactor: "inferred" as const, activityPrompt: nextPrompt };
  emit("update:profile", nextProfile);
  if (activitySaveTimeout) {
    clearTimeout(activitySaveTimeout);
    activitySaveTimeout = null;
  }
  latestActivityToSave = nextPrompt;
  emit("save-activity", nextPrompt);
}

function onActivityPromptInput(event: Event) {
  const nextPrompt = (event.target as HTMLTextAreaElement).value;
  activityDraft.value = nextPrompt;
  saveActivityProfile(nextPrompt);
}
</script>

<template>
  <BasePanel :title="t('profile')" :helper="t('profileHelper')">
    <template #meta>
      <span v-if="isProfileRequiredMissing()" class="required-pill">{{ t("requiredNow") }}</span>
    </template>

    <div class="controls-grid">
      <FormField :label="t('sex')">
        <select
          :value="profile.sex === 'female' ? 'female' : 'male'"
          @change="
            saveImmediateProfile({
              ...profile,
              sex: ($event.target as HTMLSelectElement).value as BiologicalSex,
            })
          "
        >
          <option value="male">{{ t("male") }}</option>
          <option value="female">{{ t("female") }}</option>
        </select>
      </FormField>
      <FormField :label="t('age')">
        <input
          :class="{ 'is-missing': profile.age == null }"
          :value="profile.age ?? ''"
          type="number"
          @input="saveNullableNumber('age', $event)"
        />
      </FormField>
      <FormField :label="t('height')">
        <div class="unit-field">
          <input
            :class="{ 'is-missing': profile.height == null }"
            :value="profile.height ?? ''"
            type="number"
            @input="saveNullableNumber('height', $event)"
          />
          <span class="field-unit">{{ t("unitCm") }}</span>
        </div>
      </FormField>
      <FormField :label="t('estimatedWeight')">
        <div class="unit-field">
          <input
            :value="profile.estimatedWeight ?? ''"
            type="number"
            step="0.1"
            @input="saveNullableNumber('estimatedWeight', $event)"
          />
          <span class="field-unit">{{ t("unitKg") }}</span>
        </div>
      </FormField>
      <FormField :label="t('targetWeight')" :helper="t('targetWeightHelper')">
        <div class="unit-field">
          <input
            :value="profile.targetWeight ?? ''"
            type="number"
            step="0.1"
            @input="saveNullableNumber('targetWeight', $event)"
          />
          <span class="field-unit">{{ t("unitKg") }}</span>
        </div>
      </FormField>
      <FormField>
        <template #label>
          <span class="bodyfat-label">
            <span>{{ t("bodyFat") }}</span>
            <span class="optional-pill">{{ t("optionalLabel") }}</span>
          </span>
        </template>
        <input
          :value="profile.bodyFat ?? ''"
          type="number"
          step="0.1"
          min="0"
          max="60"
          @input="saveNullableNumber('bodyFat', $event)"
        />
        <template #helper>
          <small class="helper-text helper-slot">
            <a
              href="https://www.google.com/search?q=how+to+estimate+or+measure+body+fat+percentage"
              target="_blank"
              rel="noreferrer"
            >
              {{ t("bodyFatLearnMore") }}
            </a>
          </small>
        </template>
      </FormField>
      <FormField class="goal-mode-field" :label="t('goalMode')" :helper="t('goalModeHelper')">
        <select
          :value="profile.goalMode"
          @change="
            saveImmediateProfile({
              ...profile,
              goalMode: ($event.target as HTMLSelectElement).value as Profile['goalMode'],
            })
          "
        >
          <option value="cut">{{ t('goalModeCut') }}</option>
          <option value="leanMass">{{ t('goalModeLeanMass') }}</option>
          <option value="maingain">{{ t('goalModeMaingain') }}</option>
        </select>
      </FormField>
    </div>

    <FormField
      :label="t('activityPrompt')"
      stacked
      class="stacked"
    >
      <div class="activity-pane">
        <FieldControl as="textarea" :is-saving="isSavingActivity">
          <textarea
            class="constant-textarea"
            :class="{ 'is-missing': !activityDraft.trim() }"
            :value="activityDraft"
            :placeholder="t('activityPromptPlaceholder')"
            @input="onActivityPromptInput"
            @blur="flushActivityProfile(activityDraft)"
          ></textarea>
        </FieldControl>
      </div>
    </FormField>
    <p class="status-line">{{ t("profileTdeeAutosave") }}</p>
  </BasePanel>
</template>

<style scoped>
.helper-text,
.status-line {
  color: var(--text-muted);
  margin: 0;
}

.controls-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--controls-gap, var(--group-gap));
  align-items: start;
}

.controls-grid :deep(.field) {
  inline-size: var(--compact-control-inline-size);
  max-inline-size: 100%;
}

.controls-grid :deep(.goal-mode-field) {
  inline-size: calc(var(--compact-control-inline-size) * 1.55);
}

.stacked {
  /* no extra margin — BasePanel --panel-gap handles rhythm */
}

.activity-pane {
  display: grid;
  gap: var(--field-gap);
  padding: 0.8rem;
  padding-block-end: 1rem;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 72%, var(--panel));
  box-shadow: var(--bevel-raised);
}

.unit-field {
  display: inline-flex;
  gap: var(--field-gap);
  align-items: center;
  inline-size: min(100%, max-content);
  max-inline-size: 100%;
}

.field-unit {
  padding: 0.26rem 0.45rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: var(--bevel-raised);
  color: var(--text-muted);
  white-space: nowrap;
}

.bodyfat-label {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: baseline;
}

.optional-pill {
  padding: 0 0.28rem;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.84rem;
}

.helper-slot {
  min-block-size: 1.2rem;
  display: block;
}

@media (max-width: 640px) {
  .controls-grid {
    flex-direction: column;
    align-items: stretch;
  }

  .controls-grid :deep(.field) {
    inline-size: 100%;
  }

}
</style>
