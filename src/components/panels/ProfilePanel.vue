<script setup lang="ts">
import { computed } from "vue";
import DraftNumberInput from "../base/DraftNumberInput.vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale, ActivityFactor, BiologicalSex, Profile } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  profile: Profile;
  estimatedLeanWeight: number | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "update:profile": [profile: Profile];
  save: [profile: Profile];
}>();

const isProfileRequiredMissing = () =>
  props.profile.age == null || props.profile.height == null;

const activityOptions = computed<Array<{ value: ActivityFactor; label: string; description: string }>>(() => [
  {
    value: "sedentary",
    label: t("activityFactorSedentary"),
    description: t("activityFactorSedentaryExplain"),
  },
  {
    value: "light",
    label: t("activityFactorLight"),
    description: t("activityFactorLightExplain"),
  },
  {
    value: "moderate",
    label: t("activityFactorModerate"),
    description: t("activityFactorModerateExplain"),
  },
  {
    value: "veryActive",
    label: t("activityFactorVeryActive"),
    description: t("activityFactorVeryActiveExplain"),
  },
  {
    value: "extraActive",
    label: t("activityFactorExtraActive"),
    description: t("activityFactorExtraActiveExplain"),
  },
]);

const activityFactorSearchUrl = computed(() =>
  props.locale === "he"
    ? "https://www.google.com/search?q=%D7%90%D7%99%D7%9A+%D7%9C%D7%91%D7%97%D7%95%D7%A8+%D7%9E%D7%A7%D7%93%D7%9D+%D7%A4%D7%A2%D7%99%D7%9C%D7%95%D7%AA+tdee"
    : "https://www.google.com/search?q=how+to+choose+activity+factor+tdee",
);

function commitNullableNumber<K extends "age" | "height" | "estimatedWeight" | "targetWeight" | "bodyFat">(
  key: K,
  value: number | null,
) {
  const nextProfile = { ...props.profile, [key]: value };
  emit("update:profile", nextProfile);
  emit("save", nextProfile);
}

function updateNullableNumberDraft<K extends "age" | "height" | "estimatedWeight" | "targetWeight" | "bodyFat">(
  key: K,
  value: string,
  parseMode: "positive" | "nonnegative",
) {
  const trimmed = value.trim();
  const parsed = trimmed ? Number(trimmed) : null;
  if (parsed !== null && (!Number.isFinite(parsed) || (parseMode === "positive" ? parsed <= 0 : parsed < 0))) {
    return;
  }

  const nextProfile = { ...props.profile, [key]: parsed };
  emit("update:profile", nextProfile);
  emit("save", nextProfile);
}

function saveImmediateProfile(profile: Profile) {
  emit("update:profile", profile);
  emit("save", profile);
}

function saveActivityFactor(activityFactor: ActivityFactor) {
  saveImmediateProfile({ ...props.profile, activityFactor });
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
          <DraftNumberInput
            :class="{ 'is-missing': profile.age == null }"
            :value="profile.age"
            parse-mode="positive"
            @update:draft="updateNullableNumberDraft('age', $event, 'positive')"
            @commit="commitNullableNumber('age', $event)"
          />
      </FormField>
      <FormField :label="t('height')">
        <div class="unit-field">
          <DraftNumberInput
            :class="{ 'is-missing': profile.height == null }"
            :value="profile.height"
            parse-mode="positive"
            @update:draft="updateNullableNumberDraft('height', $event, 'positive')"
            @commit="commitNullableNumber('height', $event)"
          />
          <span class="field-unit">{{ t("unitCm") }}</span>
        </div>
      </FormField>
      <FormField :label="t('estimatedWeight')">
        <div class="unit-field">
          <DraftNumberInput
            :value="profile.estimatedWeight"
            parse-mode="positive"
            step="0.1"
            @update:draft="updateNullableNumberDraft('estimatedWeight', $event, 'positive')"
            @commit="commitNullableNumber('estimatedWeight', $event)"
          />
          <span class="field-unit">{{ t("unitKg") }}</span>
        </div>
      </FormField>
      <FormField :label="t('targetWeight')" :helper="t('targetWeightHelper')">
        <div class="unit-field">
          <DraftNumberInput
            :value="profile.targetWeight"
            parse-mode="positive"
            step="0.1"
            @update:draft="updateNullableNumberDraft('targetWeight', $event, 'positive')"
            @commit="commitNullableNumber('targetWeight', $event)"
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
        <DraftNumberInput
          :value="profile.bodyFat"
          parse-mode="nonnegative"
          step="0.1"
          min="0"
          max="60"
          @update:draft="updateNullableNumberDraft('bodyFat', $event, 'nonnegative')"
          @commit="commitNullableNumber('bodyFat', $event)"
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

    <FormField :label="t('activityFactor')" class="stacked activity-factor-field">
      <div class="activity-factor-picker">
        <select
          class="activity-factor-select"
          data-testid="activity-factor-select"
          :value="profile.activityFactor"
          @change="saveActivityFactor(($event.target as HTMLSelectElement).value as ActivityFactor)"
        >
          <option
            v-for="option in activityOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ `${option.label} - ${option.description}` }}
          </option>
        </select>
      </div>
      <template #helper>
        <small class="helper-text helper-slot">
          <a
            :href="activityFactorSearchUrl"
            target="_blank"
            rel="noreferrer"
          >
            {{ t("activityFactorLearnMore") }}
          </a>
        </small>
      </template>
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

.controls-grid :deep(input),
.controls-grid :deep(select) {
  min-inline-size: 0;
}

.controls-grid :deep(.goal-mode-field) {
  inline-size: calc(var(--compact-control-inline-size) * 1.55);
}

.activity-factor-field {
  display: grid;
  flex: 1 1 100%;
  inline-size: 100%;
  min-inline-size: 0;
}

.activity-factor-picker {
  display: grid;
  gap: 0.75rem;
  inline-size: 100%;
  min-inline-size: 0;
}

.activity-factor-select {
  inline-size: 100%;
  max-inline-size: none;
  min-inline-size: 0;
}

.unit-field {
  display: flex;
  gap: var(--field-gap);
  align-items: center;
  inline-size: 100%;
  min-inline-size: 0;
}

.unit-field :deep(input) {
  flex: 1 1 auto;
  min-inline-size: 0;
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

  .unit-field {
    inline-size: 100%;
  }

  .unit-field :deep(input) {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

}
</style>
