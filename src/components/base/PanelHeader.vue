<script setup lang="ts">
defineProps<{
  title: string;
  helper?: string;
}>();
</script>

<template>
  <div class="section-header">
    <div>
      <h2>{{ title }}</h2>
      <p v-if="helper" class="helper-text">{{ helper }}</p>
    </div>
    <slot name="meta" />
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  gap: 8px;
  align-items: start;
  justify-content: space-between;
}

.helper-text {
  color: var(--text-muted);
  margin: 0;
}

@media (max-width: 960px) {
  .section-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
