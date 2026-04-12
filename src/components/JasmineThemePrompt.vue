<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const JASMINE_THEME_DIALOG_DISMISSED_KEY = "calorie-tracker.jasmine-theme-dialog.dismissed";

const props = defineProps<{
  confirmedUsername: string;
  isThemeActive: boolean;
}>();

const emit = defineEmits<{
  apply: [];
}>();

const { t } = useI18n();
const dialogRef = ref<HTMLDialogElement | null>(null);
const dismissed = ref(false);

const shouldOffer = computed(
  () => props.confirmedUsername.trim().toLowerCase() === "jasmine" && !dismissed.value,
);

function readStoredDismissed() {
  try {
    return localStorage.getItem(JASMINE_THEME_DIALOG_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredDismissed(value: boolean) {
  try {
    localStorage.setItem(JASMINE_THEME_DIALOG_DISMISSED_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

function dismiss() {
  dismissed.value = true;
  writeStoredDismissed(true);
  if (dialogRef.value?.open) {
    dialogRef.value.close("dismissed");
  }
}

function apply() {
  emit("apply");
  dismiss();
}

async function syncDialog() {
  await nextTick();
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }

  if (!shouldOffer.value) {
    if (dialog.open) {
      dialog.close("hidden");
    }
    return;
  }

  if (dialog.open) {
    return;
  }

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "");
}

watch(
  () => [props.confirmedUsername, props.isThemeActive, shouldOffer.value],
  () => {
    void syncDialog();
  },
  { immediate: true },
);

onMounted(() => {
  dismissed.value = readStoredDismissed();
  void syncDialog();
});
</script>

<template>
  <dialog ref="dialogRef" class="jasmine-theme-dialog">
    <form method="dialog" class="jasmine-theme-dialog__form" @submit.prevent="dismiss">
      <h2 class="jasmine-theme-dialog__title">{{ t("jasmineThemeOfferTitle") }}</h2>
      <p class="jasmine-theme-dialog__copy">
        {{ props.isThemeActive ? t("jasmineThemeOfferCopyActive") : t("jasmineThemeOfferCopy") }}
      </p>
      <div class="jasmine-theme-dialog__actions">
        <button
          v-if="!props.isThemeActive"
          type="button"
          class="jasmine-theme-dialog__apply"
          autofocus
          @click="apply"
        >
          {{ t("jasmineThemeOfferApply") }}
        </button>
        <button
          type="submit"
          class="secondary-action jasmine-theme-dialog__close"
          :autofocus="props.isThemeActive || undefined"
        >
          {{ t("jasmineThemeOfferDismiss") }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.jasmine-theme-dialog {
  inline-size: min(28rem, calc(100vw - 2rem));
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--border-strong) 78%, #d9fff7 22%);
  background: var(--panel);
  color: var(--text-primary);
  box-shadow: 0 20px 52px rgba(0, 0, 0, 0.28), var(--bevel-raised);
}

.jasmine-theme-dialog::backdrop {
  background: rgba(7, 15, 19, 0.42);
}

.jasmine-theme-dialog__form {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
}

.jasmine-theme-dialog__title {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.2;
}

.jasmine-theme-dialog__copy {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.jasmine-theme-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.65rem;
}

.jasmine-theme-dialog__apply {
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: var(--accent);
  color: var(--button-primary-text, #0b1b17);
  font-weight: 800;
}

.jasmine-theme-dialog__apply:hover {
  background: color-mix(in srgb, var(--accent) 82%, white 18%);
}

.jasmine-theme-dialog__close {
  color: var(--text-primary);
}

@media (max-width: 960px) {
  .jasmine-theme-dialog__actions {
    flex-direction: column;
  }

  .jasmine-theme-dialog__actions > button {
    inline-size: 100%;
  }
}
</style>