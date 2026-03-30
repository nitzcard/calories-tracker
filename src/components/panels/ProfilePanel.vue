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
  deducedWeight: number | null;
  estimatedLeanWeight: number | null;
  isSavingActivity: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "update:profile": [profile: Profile];
  save: [profile: Profile];
  "save-activity": [value: string];
}>();

const activityDraft = ref(props.profile.activityPrompt);
const isProfileRequiredMissing = () =>
  props.profile.age == null || props.profile.height == null || !activityDraft.value.trim();

watch(
  () => props.profile.activityPrompt,
  (next) => {
    activityDraft.value = next;
  },
);

function saveNullableNumber<K extends "age" | "height" | "estimatedWeight" | "bodyFat">(key: K, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const nextProfile = { ...props.profile, [key]: raw ? Number(raw) : null };
  emit("update:profile", nextProfile);
  emit("save", nextProfile);
}

function saveImmediateProfile(profile: Profile) {
  emit("update:profile", profile);
  emit("save", profile);
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
        <input
          :class="{ 'is-missing': profile.height == null }"
          :value="profile.height ?? ''"
          type="number"
          @input="saveNullableNumber('height', $event)"
        />
      </FormField>
      <FormField :label="t('estimatedWeight')">
        <input
          :value="profile.estimatedWeight ?? ''"
          type="number"
          @input="saveNullableNumber('estimatedWeight', $event)"
        />
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
      <FormField :label="t('deducedWeight')" :helper="t('deducedWeightHelper')">
        <input
          class="deduced-input"
          :value="props.deducedWeight ?? ''"
          type="number"
          disabled
          readonly
        />
      </FormField>
      <FormField :label="t('estimatedLeanWeight')" :helper="t('estimatedLeanWeightHelper')">
        <input
          class="deduced-input"
          :value="props.estimatedLeanWeight ?? ''"
          type="number"
          disabled
          readonly
        />
      </FormField>
    </div>
      <FormField
        :label="t('activityPrompt')"
        :helper="t('profileTdeeAutosave')"
        stacked
        class="stacked"
      >
      <FieldControl as="textarea" :is-saving="isSavingActivity">
        <textarea
          class="constant-textarea"
          :class="{ 'is-missing': !activityDraft.trim() }"
          :value="activityDraft"
          :placeholder="t('activityPlaceholder')"
          @input="activityDraft = ($event.target as HTMLTextAreaElement).value"
          @blur="emit('save-activity', activityDraft)"
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--group-gap);
  align-items: start;
}

.stacked {
  /* no extra margin — BasePanel --panel-gap handles rhythm */
}

.constant-textarea {
  block-size: 12rem;
  min-block-size: 12rem;
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

.required-pill {
  display: inline-block;
  padding: 0.12rem 0.42rem;
  border: 1px solid #7c2d2d;
  background: #f0c6c3;
  color: #651c1c;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: var(--bevel-raised);
  white-space: nowrap;
}

.helper-slot {
  min-block-size: 1.2rem;
  display: block;
}

input.is-missing,
textarea.is-missing {
  border-color: #8f3333;
  box-shadow: 0 0 0 1px rgba(143, 51, 51, 0.35);
}
</style>
