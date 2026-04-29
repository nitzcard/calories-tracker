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
  gap: 0.75rem;
  align-items: start;
  justify-content: space-between;
}

.section-header h2 {
  font-size: 1.08rem;
  font-weight: 780;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.helper-text {
  color: var(--text-muted);
  margin: 0;
  max-inline-size: 42rem;
  line-height: 1.5;
  font-size: 0.91rem;
}

@media (max-width: 960px) {
  .section-header {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
