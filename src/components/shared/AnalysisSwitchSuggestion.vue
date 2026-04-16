<script setup lang="ts">
defineProps<{
  modelLabel: string;
}>();

const emit = defineEmits<{
  accept: [];
}>();
</script>

<template>
  <i18n-t keypath="analysisSwitchSuggestionHelper" tag="span" class="analysis-switch-suggestion">
    <template #model>
      <a
        class="analysis-switch-link"
        href="#"
        dir="ltr"
        @click.prevent="emit('accept')"
      >
        {{ modelLabel }}
      </a>
    </template>
  </i18n-t>
</template>

<style scoped>
.analysis-switch-suggestion {
  display: inline;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.35;
}

.analysis-switch-link {
  color: inherit;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 0.12em;
  cursor: pointer;
}
</style>
