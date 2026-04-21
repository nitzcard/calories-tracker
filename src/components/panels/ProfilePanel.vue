<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { ActivityFactor, AppLocale, BiologicalSex, Profile } from "../../types";

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
  "save-activity": [activityFactor: ActivityFactor, activityPrompt: string];
}>();

const ACTIVITY_PROMPTS: Record<ActivityFactor, string> = {
  sedentary: "Mostly sitting, little walking, and no regular training.",
  light: "Desk work with some walking and a few light activities each week.",
  moderate: "A fairly active routine with regular workouts or a moving job.",
  veryActive: "Hard training, a physical job, or lots of daily movement.",
};

const activityDraft = ref(props.profile.activityPrompt);
const activityFactorDraft = ref<ActivityFactor>(props.profile.activityFactor);
const isProfileRequiredMissing = () =>
  props.profile.age == null || props.profile.height == null || !activityDraft.value.trim();

let profileSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let latestProfileToSave: Profile | null = null;
const PROFILE_SAVE_DEBOUNCE_MS = 2000;
let activitySaveTimeout: ReturnType<typeof setTimeout> | null = null;
let latestActivityToSave: { factor: ActivityFactor; prompt: string } | null = null;

watch(
  () => props.profile.activityFactor,
  (next) => {
    activityFactorDraft.value = next;
  },
);

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

	function saveNullableNumber<K extends "age" | "height" | "estimatedWeight" | "targetWeight" | "bodyFat">(key: K, event: Event) {
	  const raw = (event.target as HTMLInputElement).value;
	  const nextProfile = { ...props.profile, [key]: raw ? Number(raw) : null };
	  emit("update:profile", nextProfile);
    scheduleProfileSave(nextProfile);
	}

function saveImmediateProfile(profile: Profile) {
  emit("update:profile", profile);
  scheduleProfileSave(profile);
}

function saveActivityProfile(nextFactor: ActivityFactor, nextPrompt: string) {
  const nextProfile = { ...props.profile, activityFactor: nextFactor, activityPrompt: nextPrompt };
  emit("update:profile", nextProfile);
  latestActivityToSave = { factor: nextFactor, prompt: nextPrompt };
  if (activitySaveTimeout) clearTimeout(activitySaveTimeout);
  activitySaveTimeout = setTimeout(() => {
    if (!latestActivityToSave) return;
    emit("save-activity", latestActivityToSave.factor, latestActivityToSave.prompt);
    activitySaveTimeout = null;
  }, PROFILE_SAVE_DEBOUNCE_MS);
}

function flushActivityProfile(nextFactor: ActivityFactor, nextPrompt: string) {
  const nextProfile = { ...props.profile, activityFactor: nextFactor, activityPrompt: nextPrompt };
  emit("update:profile", nextProfile);
  if (activitySaveTimeout) {
    clearTimeout(activitySaveTimeout);
    activitySaveTimeout = null;
  }
  latestActivityToSave = { factor: nextFactor, prompt: nextPrompt };
  emit("save-activity", nextFactor, nextPrompt);
}

function onActivityFactorChange(event: Event) {
  const nextFactor = (event.target as HTMLSelectElement).value as ActivityFactor;
  activityFactorDraft.value = nextFactor;
  const nextPrompt = ACTIVITY_PROMPTS[nextFactor];
  activityDraft.value = nextPrompt;
  saveActivityProfile(nextFactor, nextPrompt);
}

function onActivityPromptInput(event: Event) {
  const nextPrompt = (event.target as HTMLTextAreaElement).value;
  activityDraft.value = nextPrompt;
  saveActivityProfile(activityFactorDraft.value, nextPrompt);
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

	    <div class="inferred-block">
	      <div class="inferred-title">{{ t("inferredDataTitle") }}</div>
	      <div class="inferred-row">
	        <FormField :label="t('estimatedLeanWeight')" :helper="t('estimatedLeanWeightHelper')">
	          <div class="unit-field">
	            <input
	              class="deduced-input"
	              :value="props.estimatedLeanWeight ?? ''"
	              type="number"
	              disabled
	              readonly
	            />
	            <span class="field-unit">{{ t("unitKg") }}</span>
	          </div>
	        </FormField>
	      </div>
	    </div>

	    <FormField
	      :label="t('activityPrompt')"
	      :helper="t('activityPromptHelper')"
	      stacked
	      class="stacked"
	    >
        <div class="activity-factor-block">
          <div class="activity-factor-block__label">{{ t("activityFactor") }}</div>
          <select
            class="activity-factor-select"
            :value="activityFactorDraft"
            @change="onActivityFactorChange"
          >
            <option value="sedentary">{{ t("activityFactorSedentary") }} - {{ t("activityFactorSedentaryExplain") }}</option>
            <option value="light">{{ t("activityFactorLight") }} - {{ t("activityFactorLightExplain") }}</option>
            <option value="moderate">{{ t("activityFactorModerate") }} - {{ t("activityFactorModerateExplain") }}</option>
            <option value="veryActive">{{ t("activityFactorVeryActive") }} - {{ t("activityFactorVeryActiveExplain") }}</option>
          </select>
          <small class="helper-text activity-factor-block__helper">{{ t("activityFactorHelper") }}</small>
        </div>
	      <FieldControl as="textarea" :is-saving="isSavingActivity">
	        <textarea
	          class="constant-textarea"
	          :class="{ 'is-missing': !activityDraft.trim() }"
	          :value="activityDraft"
	          :placeholder="t('activityPromptPlaceholder')"
	          @input="onActivityPromptInput"
	          @blur="flushActivityProfile(activityFactorDraft, activityDraft)"
	        ></textarea>
	      </FieldControl>
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

.inferred-block {
  display: grid;
  gap: var(--field-gap);
  margin-block-start: calc(var(--field-gap) + 0.25rem);
  padding-block-start: 0.25rem;
}

.inferred-title {
  color: var(--text-muted);
  font-weight: 700;
}

.inferred-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--controls-gap, var(--group-gap));
  align-items: start;
}

.inferred-row :deep(.field) {
  inline-size: var(--compact-control-inline-size);
  max-inline-size: 100%;
}

.stacked {
  /* no extra margin — BasePanel --panel-gap handles rhythm */
}

.activity-factor-block {
  display: grid;
  gap: 0.35rem;
  margin-block-end: 0.75rem;
}

.activity-factor-block__label {
  font-weight: 700;
  color: var(--text-muted);
}

.activity-factor-select {
  inline-size: fit-content;
  max-inline-size: 100%;
}

.activity-factor-block__helper {
  margin: 0;
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

.deduced-input {
  color: var(--text-muted);
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

  .inferred-row {
    flex-direction: column;
    align-items: stretch;
  }

  .inferred-row :deep(.field) {
    inline-size: 100%;
  }
}
</style>
